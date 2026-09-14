const express = require("express");
const crypto = require("crypto");
const pool = require("../db/postgres");
const { RequestLog, SecurityEvent } = require("../db/mongo");
const config = require("../config");

const router = express.Router();

function generateApiKey() {
  return "sk_proxy_" + crypto.randomBytes(24).toString("hex");
}

/**
 * One-time setup route: creates your first user + API key.
 * Protected by ADMIN_BOOTSTRAP_SECRET from .env so randoms can't call it.
 * POST /admin/bootstrap  { "secret": "...", "email": "you@example.com" }
 */
router.post("/admin/bootstrap", async (req, res) => {
  const { secret, email } = req.body;
  if (secret !== config.adminBootstrapSecret) {
    return res.status(403).json({ error: "Invalid bootstrap secret." });
  }

  try {
    const userResult = await pool.query(
      `INSERT INTO users (email) VALUES ($1)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [email]
    );
    const userId = userResult.rows[0].id;

    const apiKey = generateApiKey();
    const keyResult = await pool.query(
      `INSERT INTO api_keys (user_id, key_value, label, rate_limit_per_minute)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, apiKey, "Default key", 60]
    );

    res.json({ message: "Bootstrap complete. Save this key — it won't be shown again.", apiKey: keyResult.rows[0].key_value });
  } catch (err) {
    console.error("Bootstrap error - full details:", err);
    res.status(500).json({ error: "Bootstrap failed.", details: err.message });
  }
});

// List all policies (for an admin UI to display/manage rules)
router.get("/admin/policies", async (req, res) => {
  const result = await pool.query("SELECT * FROM policies ORDER BY created_at DESC");
  res.json(result.rows);
});

// Add a new blocklist word/policy
router.post("/admin/policies", async (req, res) => {
  const { name, ruleType, config: cfg } = req.body;
  const result = await pool.query(
    `INSERT INTO policies (name, rule_type, config_json) VALUES ($1, $2, $3) RETURNING *`,
    [name, ruleType, JSON.stringify(cfg || {})]
  );
  res.json(result.rows[0]);
});

// List API keys (without exposing full key value after creation, for safety in a real product —
// simplified here for a student project)
router.get("/admin/keys", async (req, res) => {
  const result = await pool.query("SELECT id, label, rate_limit_per_minute, revoked, created_at FROM api_keys ORDER BY created_at DESC");
  res.json(result.rows);
});

// Recent request logs — feeds the dashboard's history table
router.get("/admin/logs", async (req, res) => {
  const logs = await RequestLog.find().sort({ createdAt: -1 }).limit(50);
  res.json(logs);
});

// Recent security events — feeds the dashboard's alerts panel on initial load
router.get("/admin/events", async (req, res) => {
  const events = await SecurityEvent.find().sort({ createdAt: -1 }).limit(50);
  res.json(events);
});

module.exports = router;
