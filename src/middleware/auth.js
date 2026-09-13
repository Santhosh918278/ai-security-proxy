const pool = require("../db/postgres");

/**
 * Expects the client to send:  Authorization: Bearer <api_key>
 * Looks the key up in Postgres, rejects if missing/revoked,
 * and attaches req.apiKey (the DB row) for downstream middleware to use.
 */
async function requireApiKey(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const key = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!key) {
    return res.status(401).json({ error: "Missing API key. Send 'Authorization: Bearer <key>'." });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM api_keys WHERE key_value = $1 AND revoked = FALSE",
      [key]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid or revoked API key." });
    }

    req.apiKey = result.rows[0];
    next();
  } catch (err) {
    console.error("Auth check failed:", err.message);
    res.status(500).json({ error: "Internal error during authentication." });
  }
}

module.exports = { requireApiKey };
