const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server);

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on("chat-message", (message) => {
        console.log(message);

        io.emit("chat-message", message);
    });

    socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

const PORT = 3000;

server.listen(PORT, () => {
    console.log(`Server 1 running on port ${PORT}`);
});
