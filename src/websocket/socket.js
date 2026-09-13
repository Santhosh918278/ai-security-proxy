const { WebSocketServer } = require("ws");

let wss = null;

function initWebSocket(server) {
  wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    console.log("📡 Dashboard client connected to live alert feed");
    ws.send(JSON.stringify({ type: "connected", message: "Live alert feed active." }));

    ws.on("close", () => {
      console.log("📡 Dashboard client disconnected");
    });
  });

  console.log("✅ WebSocket server attached");
}

/**
 * Call this from anywhere in the backend to push a live event to every
 * connected dashboard immediately (used for security_event alerts and
 * general request stats).
 */
function broadcast(payload) {
  if (!wss) return;
  const data = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data);
    }
  });
}

module.exports = { initWebSocket, broadcast };
