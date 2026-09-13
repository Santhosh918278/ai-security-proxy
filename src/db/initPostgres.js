/**
 * Run this once to set up your Postgres schema:
 *   npm run init-db
 */
const pool = require("./postgres");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  key_value TEXT UNIQUE NOT NULL,
  label TEXT,
  rate_limit_per_minute INTEGER DEFAULT 30,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL,        -- 'pii' | 'blocklist' | 'injection' | 'llm_judge'
  config_json JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_counters (
  id SERIAL PRIMARY KEY,
  api_key_id INTEGER REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMP NOT NULL,
  request_count INTEGER DEFAULT 0,
  UNIQUE (api_key_id, window_start)
);
`;

async function init() {
  try {
    await pool.query(SCHEMA);
    console.log("✅ Postgres schema created successfully.");

    // Seed a default blocklist policy so the firewall has something to enforce out of the box.
    await pool.query(
      `INSERT INTO policies (name, rule_type, config_json, enabled)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT DO NOTHING`,
      ["Default Blocklist", "blocklist", JSON.stringify({ words: ["stupid", "idiot", "hate"] })]
    );
    console.log("✅ Default policy seeded.");
  } catch (err) {
    console.error("❌ Failed to initialize schema:", err.message);
  } finally {
    await pool.end();
  }
}

init();
