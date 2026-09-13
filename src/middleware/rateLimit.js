const pool = require("../db/postgres");

/**
 * Simple fixed-window rate limiter: counts requests per API key within
 * the current 1-minute window, using a Postgres table. If the count
 * exceeds the key's configured limit, the request is rejected with 429.
 */
async function rateLimit(req, res, next) {
  const apiKey = req.apiKey;
  if (!apiKey) return next(); // requireApiKey should run first

  const windowStart = new Date();
  windowStart.setSeconds(0, 0); // round down to the current minute

  try {
    const upsert = await pool.query(
      `INSERT INTO usage_counters (api_key_id, window_start, request_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (api_key_id, window_start)
       DO UPDATE SET request_count = usage_counters.request_count + 1
       RETURNING request_count`,
      [apiKey.id, windowStart]
    );

    const currentCount = upsert.rows[0].request_count;

    if (currentCount > apiKey.rate_limit_per_minute) {
      return res.status(429).json({
        error: "Rate limit exceeded.",
        limitPerMinute: apiKey.rate_limit_per_minute,
      });
    }

    next();
  } catch (err) {
    console.error("Rate limit check failed:", err.message);
    next(); // fail open — don't block traffic if the limiter itself breaks
  }
}

module.exports = { rateLimit };
