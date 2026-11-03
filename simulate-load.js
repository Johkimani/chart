/**
 * Distributed Chat Load & Fault-Tolerance Simulator
 * Assignment Step 6: Testing the System under load
 */

const ioClient = require("socket.io-client");

const SERVER_1_URL = "http://localhost:3000";
const SERVER_2_URL = "http://localhost:3001";

const NUM_CLIENTS_PER_SERVER = 5;
const MESSAGES_PER_CLIENT = 3;
const DELAY_BETWEEN_MESSAGES_MS = 300;

console.log("==========================================================");
console.log("  DISTRIBUTED CHAT SYSTEM - LOAD & BROADCAST TEST SUITE   ");
console.log("==========================================================");
console.log(`Config: ${NUM_CLIENTS_PER_SERVER * 2} clients total (5 on Server 1, 5 on Server 2)`);
console.log(`Each client will send ${MESSAGES_PER_CLIENT} messages across nodes.`);
console.log("----------------------------------------------------------\n");

const clients = [];
const messageLatencies = [];
let totalSent = 0;
let totalReceived = 0;
const sentMessageTimes = new Map();

function createClient(id, serverUrl, serverName) {
    return new Promise((resolve, reject) => {
        const username = `LoadTester_${serverName}_${id}`;
        const socket = ioClient(serverUrl, {
            reconnection: false,
            timeout: 5000
        });

        socket.on("connect", () => {
            socket.emit("user-join", { username });
            resolve({ socket, id, username, serverName, serverUrl });
        });

        socket.on("connect_error", (err) => {
            console.error(`Client ${username} failed to connect to ${serverName}:`, err.message);
            reject(err);
        });

        socket.on("chat-message", (msg) => {
            if (msg.type !== "system") {
                totalReceived++;
                if (sentMessageTimes.has(msg.id)) {
                    const sendTime = sentMessageTimes.get(msg.id);
                    const latency = Date.now() - sendTime;
                    messageLatencies.push(latency);
                }
            }
        });
    });
}

async function runTest() {
    console.log("[1/4] Connecting clients to distributed cluster...");

    const connectionPromises = [];

    // Connect clients to Server 1
    for (let i = 1; i <= NUM_CLIENTS_PER_SERVER; i++) {
        connectionPromises.push(createClient(i, SERVER_1_URL, "S1"));
    }
    // Connect clients to Server 2
    for (let i = 1; i <= NUM_CLIENTS_PER_SERVER; i++) {
        connectionPromises.push(createClient(i, SERVER_2_URL, "S2"));
    }

    try {
        const connectedClients = await Promise.all(connectionPromises);
        console.log(`[SUCCESS] Connected all ${connectedClients.length} clients across Server 1 and Server 2.\n`);

        // Wait 1 second for cluster stabilization
        await new Promise((r) => setTimeout(r, 1000));

        console.log("[2/4] Broadcasting messages simultaneously across both server nodes...");

        const startTime = Date.now();

        for (let round = 1; round <= MESSAGES_PER_CLIENT; round++) {
            for (const client of connectedClients) {
                const msgId = `bench_${client.username}_${round}_${Date.now()}`;
                sentMessageTimes.set(msgId, Date.now());
                totalSent++;

                client.socket.emit("chat-message", {
                    id: msgId,
                    username: client.username,
                    text: `[Round ${round}] Hello cluster from ${client.serverName} node!`
                });

                await new Promise((r) => setTimeout(r, 50));
            }
            await new Promise((r) => setTimeout(r, DELAY_BETWEEN_MESSAGES_MS));
        }

        console.log(`[3/4] Sent ${totalSent} total messages. Waiting for peer cross-cluster replication...`);
        await new Promise((r) => setTimeout(r, 2000));

        const durationSec = (Date.now() - startTime) / 1000;

        console.log("\n==========================================================");
        console.log("                     TEST RESULTS REPORT                  ");
        console.log("==========================================================");

        const avgLatency = messageLatencies.length
            ? (messageLatencies.reduce((a, b) => a + b, 0) / messageLatencies.length).toFixed(2)
            : 0;
        const minLatency = messageLatencies.length ? Math.min(...messageLatencies) : 0;
        const maxLatency = messageLatencies.length ? Math.max(...messageLatencies) : 0;

        // Total expected deliveries across all connected clients:
        // Each message should be received by all connected clients
        const expectedDeliveries = totalSent * connectedClients.length;
        const deliveryRate = ((totalReceived / expectedDeliveries) * 100).toFixed(1);

        console.log(`Total Connected Clients : ${connectedClients.length} (5 on S1, 5 on S2)`);
        console.log(`Messages Dispatched     : ${totalSent}`);
        console.log(`Total Message Receipts  : ${totalReceived}`);
        console.log(`Replication Success Rate: ${deliveryRate}%`);
        console.log(`Average Latency         : ${avgLatency} ms`);
        console.log(`Min Latency             : ${minLatency} ms`);
        console.log(`Max Latency             : ${maxLatency} ms`);
        console.log(`Total Duration          : ${durationSec.toFixed(2)} seconds`);
        console.log(`Throughput              : ${(totalSent / durationSec).toFixed(1)} msgs/sec`);
        console.log("==========================================================");

        if (Number(deliveryRate) >= 95) {
            console.log(">>> RESULT: ALL TESTS PASSED! Multi-server broadcast verified. <<<");
        } else {
            console.log(">>> WARNING: Some messages did not cross peer boundary. Check peer connection. <<<");
        }

        // Cleanup
        for (const client of connectedClients) {
            client.socket.disconnect();
        }

        process.exit(0);
    } catch (err) {
        console.error("\n[TEST FAILED] Could not complete simulation:", err.message);
        console.error("Please make sure BOTH Server 1 (port 3000) and Server 2 (port 3001) are running.");
        process.exit(1);
    }
}

runTest();

