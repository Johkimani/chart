const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const ioClient = require("socket.io-client");

function startServer({ port, peerPort, serverName }) {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: { origin: "*" }
    });

    // Ensure logs directory exists
    const logsDir = path.join(__dirname, "logs");
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFilePath = path.join(logsDir, "messages.json");

    // In-memory cache for deduplication and fast retrieval
    const seenMessageIds = new Set();
    let messageHistory = [];

    // Load existing messages from persistent log file
    function loadMessagesFromDisk() {
        try {
            if (fs.existsSync(logFilePath)) {
                const data = fs.readFileSync(logFilePath, "utf8");
                if (data.trim()) {
                    messageHistory = JSON.parse(data);
                    for (const msg of messageHistory) {
                        if (msg.id) seenMessageIds.add(msg.id);
                    }
                    console.log(`[${serverName}] Loaded ${messageHistory.length} messages from ${logFilePath}`);
                }
            }
        } catch (err) {
            console.error(`[${serverName}] Error reading message log:`, err.message);
            messageHistory = [];
        }
    }

    // Save message to disk and in-memory history
    function persistMessage(message) {
        messageHistory.push(message);
        // Keep in-memory history at reasonable size
        if (messageHistory.length > 200) {
            messageHistory.shift();
        }
        try {
            fs.writeFileSync(logFilePath, JSON.stringify(messageHistory, null, 2), "utf8");
        } catch (err) {
            console.error(`[${serverName}] Error persisting message:`, err.message);
        }
    }

    loadMessagesFromDisk();

    // Serve static files from public directory
    const publicDir = path.join(__dirname, "public");
    app.use(express.static(publicDir));

    // Health check endpoint
    app.get("/health", (req, res) => {
        res.json({
            status: "ok",
            serverName,
            port,
            peerPort,
            isPeerConnected,
            activeClients: activeUserCount,
            totalMessages: messageHistory.length
        });
    });

    let isPeerConnected = false;
    let activeUserCount = 0;
    const connectedUsers = new Map(); // socket.id -> username

    // Connect to peer server
    const peerUrl = `http://localhost:${peerPort}`;
    console.log(`[${serverName}] Establishing connection to peer at ${peerUrl}...`);

    const peerClient = ioClient(peerUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1500,
        reconnectionDelayMax: 5000,
        autoConnect: true
    });

    peerClient.on("connect", () => {
        isPeerConnected = true;
        console.log(`[${serverName}] *** SUCCESS: Connected to peer server on port ${peerPort} ***`);
        // Notify local clients about peer connection status change
        io.emit("peer-status", { peerPort, connected: true });
        // Identify ourselves to the peer
        peerClient.emit("peer-handshake", { serverName, port });
    });

    peerClient.on("disconnect", (reason) => {
        isPeerConnected = false;
        console.log(`[${serverName}] Peer on port ${peerPort} disconnected (${reason}). Standalone mode active.`);
        io.emit("peer-status", { peerPort, connected: false });
    });

    peerClient.on("connect_error", () => {
        if (isPeerConnected) {
            isPeerConnected = false;
            console.log(`[${serverName}] Lost connection to peer on port ${peerPort}. Standalone mode active.`);
            io.emit("peer-status", { peerPort, connected: false });
        }
    });

    // Handle messages relayed directly through peer client socket
    peerClient.on("peer-message", (message) => {
        handleIncomingMessage(message, /* isFromPeer= */ true);
    });

    // Process a message (from local client or from peer)
    function handleIncomingMessage(raw, isFromPeer) {
        if (!raw || (!raw.text && raw.type !== "system")) return;

        // Ensure unique message ID
        const messageId = raw.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        if (seenMessageIds.has(messageId)) {
            // Already processed this message - ignore to prevent infinite loops
            return;
        }

        seenMessageIds.add(messageId);
        // Limit seen IDs set size
        if (seenMessageIds.size > 2000) {
            const firstKey = seenMessageIds.values().next().value;
            seenMessageIds.delete(firstKey);
        }

        const message = {
            id: messageId,
            username: raw.username || "Anonymous",
            text: raw.text || "",
            timestamp: raw.timestamp || new Date().toISOString(),
            originServer: raw.originServer || serverName,
            type: raw.type || "chat"
        };

        // Persist message
        persistMessage(message);

        // Broadcast to all connected clients on this server
        io.emit("chat-message", message);
        console.log(`[${serverName}] Broadcast (${isFromPeer ? "From Peer" : "Local"}): [${message.username}]: ${message.text}`);

        // If received from a local client, relay to peer
        if (!isFromPeer && isPeerConnected) {
            peerClient.emit("peer-message", message);
        }
    }

    // Client connection handling
    io.on("connection", (socket) => {
        // Check if this connection is a peer server
        socket.on("peer-handshake", (info) => {
            socket.isPeerServer = true;
            socket.peerInfo = info;
            isPeerConnected = true;
            io.emit("peer-status", { peerPort: info.port || peerPort, connected: true });
            console.log(`[${serverName}] Registered incoming peer connection from ${info.serverName} (port ${info.port})`);
        });

        // If the peer connected to this server and sends a peer-message
        socket.on("peer-message", (message) => {
            handleIncomingMessage(message, /* isFromPeer= */ true);
        });

        // Regular chat client events
        activeUserCount++;
        console.log(`[${serverName}] Client connected: ${socket.id} (Total: ${activeUserCount})`);

        // Send server metadata and message history to the newly connected client
        socket.emit("server-info", {
            serverName,
            port,
            peerPort,
            isPeerConnected,
            connectedClients: activeUserCount
        });

        // Send recent message history so failover clients or new clients catch up
        socket.emit("message-history", messageHistory.slice(-50));

        // Client joins with a username
        socket.on("user-join", (data) => {
            const username = (data && data.username) ? String(data.username).trim() : "Anonymous";
            connectedUsers.set(socket.id, username);
            console.log(`[${serverName}] User "${username}" registered on socket ${socket.id}`);
        });

        // Chat message from a client
        socket.on("chat-message", (data) => {
            handleIncomingMessage(data, /* isFromPeer= */ false);
        });

        // Client disconnect
        socket.on("disconnect", (reason) => {
            activeUserCount = Math.max(0, activeUserCount - 1);
            if (socket.isPeerServer) {
                isPeerConnected = false;
                io.emit("peer-status", { peerPort, connected: false });
                console.log(`[${serverName}] Peer server disconnected: ${socket.peerInfo?.serverName || socket.id}`);
                return;
            }

            const username = connectedUsers.get(socket.id);
            if (username) {
                connectedUsers.delete(socket.id);
                console.log(`[${serverName}] User "${username}" left (${reason}). Active clients: ${activeUserCount}`);
            } else {
                console.log(`[${serverName}] Client disconnected: ${socket.id} (${reason})`);
            }
        });
    });

    server.listen(port, () => {
        console.log(`=========================================`);
        console.log(`  ${serverName} RUNNING on http://localhost:${port}`);
        console.log(`  Target Peer Server: http://localhost:${peerPort}`);
        console.log(`  Logs Path: ${logFilePath}`);
        console.log(`=========================================`);
    });

    return { server, io, peerClient };
}

module.exports = { startServer };

