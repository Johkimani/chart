console.log("CHAT JS LOADED");
const socket = io();

const usernameInput = document.getElementById("username");
const joinBtn = document.getElementById("joinBtn");

const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");

const messages = document.getElementById("messages");

let username = "";

joinBtn.addEventListener("click", () => {

    username = usernameInput.value.trim();

    if (!username) {
        alert("Enter username");
        return;
    }

    joinBtn.disabled = true;
    usernameInput.disabled = true;
});

sendButton.addEventListener("click", () => {

    if (!username) {
        alert("Join the chat first");
        return;
    }

    const text = messageInput.value.trim();

    if (!text) return;

    socket.emit("chat-message", {
        username,
        text
    });

    messageInput.value = "";
});

socket.on("chat-message", (data) => {

    const p = document.createElement("p");

    p.textContent = `${data.username}: ${data.text}`;

    messages.appendChild(p);
});