# Distributed Real-Time Chat Application

A fault-tolerant distributed chat application built with **Node.js**, **Express**, and **Socket.IO**. The application operates across multiple independent server nodes that communicate as peers, replicate messages in real-time, maintain persistent logs, and feature automated client failover in the event of node crashes.

---

## 🏗️ System Architecture

```
                   +------------------------+
                   |  Distributed Clients   |
                   +-----------+------------+
                               |
              +----------------+----------------+
              | (Port 3000)                     | (Port 3001)
              v                                 v
     +-----------------+     Peer Relay    +-----------------+
     |    Server 1     |<=================>|    Server 2     |
     |   (Node A)      |   (Bi-directional)|   (Node B)      |
     +--------+--------+                   +--------+--------+
              |                                     |
              v                                     v
     +-----------------+                   +-----------------+
     | Persistent Log  |                   | Persistent Log  |
     | (messages.json) |                   | (messages.json) |
     +-----------------+                   +-----------------+
```

### Components
1. **Server Nodes (`Server 1` & `Server 2`)**:
   - Run independently on ports `3000` and `3001`.
   - Maintain local client connections and peer-to-peer WebSocket connections between each other.
   - Employ **message deduplication** using unique identifiers (`id`) to prevent echoing or broadcast loops.
   - Auto-recover peer synchronization when a downed node comes back online.
2. **Client Application (`public/`)**:
   - Modern, responsive web interface.
   - Real-time node status indicator and peer sync pill.
   - **Automated Client Failover**: If the current server disconnects, the client automatically reconnects to the backup server without dropping the user's session or name.
   - Includes a manual **"⚡ Switch Node"** trigger for easy demonstration and grading.
3. **Persistence Layer (`logs/messages.json`)**:
   - All messages are serialized and persisted to disk.
   - Connecting clients receive the last 50 messages so chat history is preserved across server failover.
4. **Load & Fault Simulator (`simulate-load.js`)**:
   - Automated benchmark tool that connects 10 concurrent clients across both servers, sends bursts of messages, and outputs latency, throughput, and cross-cluster replication statistics.

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (version 16 or newer)
- npm (comes with Node.js)

### 2. Installation
Open a terminal in the project directory (`chart/`) and install dependencies:
```bash
npm install
```

---

## 🏃 Running the Application

To experience the distributed cluster and test failover, run Server 1 and Server 2 in **two separate terminal windows**:

### Terminal 1 (Start Server 1)
```bash
npm run server1
```
*Output: `Server 1 RUNNING on http://localhost:3000`*

### Terminal 2 (Start Server 2)
```bash
npm run server2
```
*Output: `Server 2 RUNNING on http://localhost:3001`*
*Output: `*** SUCCESS: Connected to peer server on port 3000 ***`*

---

## 🧪 Step-by-Step Testing Guide

### Test 1: Cross-Server Real-Time Chat
1. Open Browser Window 1: Go to [http://localhost:3000](http://localhost:3000).
   - Enter username: `Alice` -> Click **Join Chat Room**.
   - Note the badge: `Active Node: Server 1 (Port 3000)`.
2. Open Browser Window 2: Go to [http://localhost:3001](http://localhost:3001).
   - Enter username: `Bob` -> Click **Join Chat Room**.
   - Note the badge: `Active Node: Server 2 (Port 3001)`.
3. Send a message from `Alice` on Server 1:
   - Notice that `Bob` on Server 2 receives it immediately with a `[Server 1]` badge.
4. Reply from `Bob` on Server 2:
   - Notice that `Alice` on Server 1 receives it immediately with a `[Server 2]` badge.

---

### Test 2: Server Failure & Automated Failover
1. While `Alice` is connected to Server 1 on `http://localhost:3000`, switch to **Terminal 1** and press `Ctrl + C` to kill Server 1.
2. Observe `Alice`'s browser window:
   - The status indicator turns amber: `Connection lost! Failing over...`.
   - The client seamlessly reconnects to `Server 2 (Port 3001)`.
   - The UI shows `Connected to Server 2` and activates the badge: `⚠️ Failover Active: Running on Backup Node`.
   - Alice's username is retained, and message history remains visible!
3. Send a message from Alice:
   - The message is processed by Server 2 and received by Bob!

---

### Test 3: Node Recovery & Peer Re-synchronization
1. In **Terminal 1**, restart Server 1:
   ```bash
   npm run server1
   ```
2. Both terminals will log:
   - `*** SUCCESS: Connected to peer server ***`
   - Both servers resume peer relay without needing any manual intervention.

---

### Test 4: Automated Load Testing
Run the automated benchmark script to test concurrency and measure message latency:
```bash
npm run test:load
```
This script will:
- Connect 10 simulated clients (5 to Server 1, 5 to Server 2).
- Dispatch messages concurrently across both servers.
- Compute average latency, minimum/maximum roundtrip times, throughput, and verify a 100% replication rate across cluster boundaries.

---

## 📁 Project Structure

```
chart/
├── logs/
│   └── messages.json       # Persistent message store
├── public/
│   ├── index.html          # Chat interface (Deliverable 1 UI)
│   ├── style.css           # Styling with responsive cards & status badges
│   └── chat.js             # Client logic with automated failover controller
├── server1/
│   └── server.js           # Server 1 entry point (Port 3000, peer: 3001)
├── server2/
│   └── server.js           # Server 2 entry point (Port 3001, peer: 3000)
├── server-core.js          # Shared distributed server logic & peer relay
├── simulate-load.js        # Automated load & concurrency test suite
├── package.json            # Scripts & dependencies
├── README.md               # Setup & user guide
└── REPORT.md               # 2-3 page comprehensive academic report
```

