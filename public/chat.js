const socket = io();

const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const messages = document.getElementById("messages");

sendButton.addEventListener("click", () => {

    const message = messageInput.value;

    if (!message.trim()) return;

    socket.emit("chat-message", message);

    messageInput.value = "";
});

socket.on("chat-message", (message) => {

    const p = document.createElement("p");

    p.textContent = message;

    messages.appendChild(p);
});