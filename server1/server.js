const { startServer } = require("../server-core");

startServer({
    port: 3000,
    peerPort: 3001,
    serverName: "Server 1"
});
