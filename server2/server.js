const { startServer } = require("../server-core");

startServer({
    port: 3001,
    peerPort: 3000,
    serverName: "Server 2"
});
