require("dotenv").config();

module.exports = {
  port: process.env.PORT || 5000,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  llmModel: process.env.LLM_MODEL || "claude-sonnet-4-5-20250929",
  judgeModel: process.env.JUDGE_MODEL || "claude-haiku-4-5-20251001",
  pg: {
    host: process.env.PG_HOST || "localhost",
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE || "ai_proxy",
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "postgres",
  },
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/ai_proxy_logs",
  adminBootstrapSecret: process.env.ADMIN_BOOTSTRAP_SECRET || "change_this_before_deploying",
  mockMode: process.env.MOCK_MODE === "true",
};
