console.log("Distributed Chat Client Initializing...");

// Cluster configuration
const SERVERS = [
    { name: "Server 1", port: 3000, url: "http://localhost:3000" },
    { name: "Server 2", port: 3001, url: "http://localhost:3001" }
];

// Determine initial server based on page origin, or default to Server 1
let currentServerIndex = 0;
if (window.location.port === "3001") {
    currentServerIndex = 1;
}

let socket = null;
let currentUsername = "";
let isJoined = false;
let isFailingOver = false;
let isFailoverActive = false;
const renderedMessageIds = new Set();

// UI Elements
const statusDot = document.getElementById("statusDot");
const serverStatusText = document.getElementById("serverStatusText");
const peerDot = document.getElementById("peerDot");
const peerStatusText = document.getElementById("peerStatusText");
const activeNodeBadge = document.getElementById("activeNodeBadge");
const failoverNotice = document.getElementById("failoverNotice");
const userBadge = document.getElementById("userBadge");
const currentUsernameDisplay = document.getElementById("currentUsernameDisplay");
const manualFailoverBtn = document.getElementById("manualFailoverBtn");

const joinSection = document.getElementById("joinSection");
const chatSection = document.getElementById("chatSection");
const usernameInput = document.getElementById("usernameInput");
const joinBtn = document.getElementById("joinBtn");

const messagesContainer = document.getElementById("messagesContainer");
const messagesList = document.getElementById("messagesList");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");

// Update UI Indicators
function updateConnectionStatus(state, message) {
    statusDot.className = "status-indicator " + state;
    serverStatusText.textContent = message;
}

function updatePeerStatus(connected, peerPort) {
    if (connected) {
        peerDot.className = "peer-dot synced";
        peerStatusText.textContent = `Peer (: ${peerPort}): Synced`;
    } else {
        peerDot.className = "peer-dot offline";
        peerStatusText.textContent = `Peer (: ${peerPort}): Offline`;
    }
}

function updateNodeBadge(serverName, port) {
    activeNodeBadge.textContent = `Active Node: ${serverName} (Port ${port})`;
    if (isFailoverActive) {
        failoverNotice.style.display = "inline-block";
    } else {
        failoverNotice.style.display = "none";
    }
}

// Format timestamp
function formatTime(isoString) {
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
        return "";
    }
}

// Append a system message to the chat
function addSystemMessage(text, alertType = "") {
    const div = document.createElement("div");
    div.className = `system-notification ${alertType}`;
    div.textContent = text;
    messagesList.appendChild(div);
    scrollToBottom();
}

// Append a chat message to the chat
function addChatMessage(msg) {
    if (msg.id && renderedMessageIds.has(msg.id)) {
        return; // Prevent duplicate display
    }
    if (msg.id) {
        renderedMessageIds.add(msg.id);
    }

    // Filter out system messages so they do not clutter the chat
    if (msg.type === "system") {
        return;
    }

    const isLocalUser = currentUsername && (msg.username.toLowerCase() === currentUsername.toLowerCase());
    const item = document.createElement("div");
    item.className = `message-item ${isLocalUser ? "local-user" : "remote-user"}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const sender = document.createElement("span");
    sender.className = "message-sender";
    sender.textContent = isLocalUser ? "You" : msg.username;

    const time = document.createElement("span");
    time.className = "message-time";
    time.textContent = formatTime(msg.timestamp);

    const serverTag = document.createElement("span");
    const serverClass = (msg.originServer && msg.originServer.toLowerCase().includes("2")) ? "server-2" : "server-1";
    serverTag.className = `server-tag ${serverClass}`;
    serverTag.textContent = msg.originServer || "Server";

    meta.appendChild(sender);
    meta.appendChild(time);
    meta.appendChild(serverTag);

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = msg.text;

    item.appendChild(meta);
    item.appendChild(bubble);

    messagesList.appendChild(item);
    scrollToBottom();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Connect to a server node with automated failover
function connectToServer(index, failoverTriggered = false) {
    const target = SERVERS[index];
    currentServerIndex = index;

    if (failoverTriggered) {
        isFailoverActive = true;
    }

    console.log(`Connecting to ${target.name} at ${target.url}... (Failover: ${failoverTriggered})`);
    updateConnectionStatus("connecting", `Connecting to ${target.name}...`);
    updateNodeBadge(target.name, target.port);

    if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
    }

    // Initialize socket connection to the target server
    socket = io(target.url, {
        reconnection: false, // We control failover explicitly
        timeout: 3500
    });

    // Successfully connected
    socket.on("connect", () => {
        isFailingOver = false;
        console.log(`Successfully connected to ${target.name} (Socket ID: ${socket.id})`);
        updateConnectionStatus("connected", `Connected to ${target.name}`);

        // If user had already joined, automatically re-register on the new server
        if (isJoined && currentUsername) {
            socket.emit("user-join", { 
                username: currentUsername,
                isReconnection: failoverTriggered 
            });
        }
    });

    // Server metadata & cluster status
    socket.on("server-info", (info) => {
        console.log("Cluster info received:", info);
        updatePeerStatus(info.isPeerConnected, info.peerPort);
        if (info.isPeerConnected) {
            isFailoverActive = false;
            failoverNotice.style.display = "none";
        } else if (failoverTriggered) {
            isFailoverActive = true;
            failoverNotice.style.display = "inline-block";
        }
    });

    // Real-time peer status changes
    socket.on("peer-status", (data) => {
        updatePeerStatus(data.connected, data.peerPort);
        if (data.connected) {
            // When peer is connected, all servers in the cluster are healthy and running!
            isFailoverActive = false;
            failoverNotice.style.display = "none";
        } else {
            // When peer disconnects, mark failover/backup notice
            isFailoverActive = true;
            failoverNotice.style.display = "inline-block";
        }
    });

    // Load message history persisted by the server
    socket.on("message-history", (history) => {
        if (Array.isArray(history)) {
            history.forEach((msg) => addChatMessage(msg));
        }
    });

    // Incoming chat message
    socket.on("chat-message", (data) => {
        addChatMessage(data);
    });

    // Connection error (server unreachable)
    socket.on("connect_error", (err) => {
        console.warn(`Connection error on ${target.name}:`, err.message);
        triggerFailover(`Connection error on ${target.name}`);
    });

    // Server crash / termination
    socket.on("disconnect", (reason) => {
        console.warn(`Disconnected from ${target.name}:`, reason);
        triggerFailover(`Server disconnected (${reason})`);
    });
}

// Failover to next server node
function triggerFailover(reason) {
    if (isFailingOver) return;
    isFailingOver = true;

    const currentTarget = SERVERS[currentServerIndex];
    const nextIndex = (currentServerIndex + 1) % SERVERS.length;
    const nextTarget = SERVERS[nextIndex];

    console.warn(`[FAILOVER TRIGGERED] Reason: ${reason}. Switching from ${currentTarget.name} to ${nextTarget.name}...`);
    updateConnectionStatus("connecting", `Failing over to ${nextTarget.name}...`);

    // Clean disconnect of old socket
    if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
    }

    setTimeout(() => {
        connectToServer(nextIndex, true);
    }, 1200);
}

// Manual failover / Node switch button
manualFailoverBtn.addEventListener("click", () => {
    const nextIndex = (currentServerIndex + 1) % SERVERS.length;
    connectToServer(nextIndex, true);
});

// User Join Form
joinBtn.addEventListener("click", handleJoin);
usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleJoin();
});

function handleJoin() {
    const name = usernameInput.value.trim();
    if (!name) {
        alert("Please enter a display name to join.");
        return;
    }

    currentUsername = name;
    isJoined = true;

    // Switch view from join card to chat window
    joinSection.style.display = "none";
    chatSection.style.display = "flex";
    userBadge.style.display = "inline-block";
    currentUsernameDisplay.textContent = currentUsername;

    // Register with active server node
    if (socket && socket.connected) {
        socket.emit("user-join", { username: currentUsername });
    }

    messageInput.focus();
}

// Message submission
messageForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;

    if (!socket || !socket.connected) {
        addSystemMessage("❌ Cannot send message: Server node is currently offline. Please wait for failover.", "failover-alert");
        return;
    }

    socket.emit("chat-message", {
        username: currentUsername,
        text: text
    });

    messageInput.value = "";
    messageInput.focus();
});

// Start initial connection
connectToServer(currentServerIndex, false);
