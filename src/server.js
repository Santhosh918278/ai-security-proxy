const express = require("express");
const cors = require("cors");
const http = require("http");

const config = require("./config");
const { connectMongo } = require("./db/mongo");
const { initWebSocket } = require("./websocket/socket");
const { requireApiKey } = require("./middleware/auth");
const { rateLimit } = require("./middleware/rateLimit");

const chatRoutes = require("./routes/chat");
const adminRoutes = require("./routes/admin");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "AI Security Proxy is running." });
});

// Protected route: every /chat call must have a valid API key and respect rate limits.
app.use("/chat", requireApiKey, rateLimit, chatRoutes);

// Admin/dashboard routes (bootstrap is self-protected via a secret; the rest are
// left open here for simplicity in a student project — add auth before real deployment).
app.use("/", adminRoutes);

const server = http.createServer(app);
initWebSocket(server);

async function start() {
  try {
    await connectMongo();
  } catch (err) {
    console.error("⚠️  MongoDB connection failed:", err.message);
    console.error("    The server will still start, but logging will not work until Mongo is reachable.");
  }

  server.listen(config.port, () => {
    console.log(`✅ AI Security Proxy running at http://localhost:${config.port}`);
    console.log(`   WebSocket live-alert feed on the same port.`);
    console.log(`   Run 'npm run init-db' first if you haven't set up Postgres tables yet.`);
  });
}

start();
