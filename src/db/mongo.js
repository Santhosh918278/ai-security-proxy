const mongoose = require("mongoose");
const config = require("../config");

async function connectMongo() {
  await mongoose.connect(config.mongoUri);
  console.log("✅ MongoDB connected");
}

// Every request/response that passes through the proxy (blocked or not).
const requestLogSchema = new mongoose.Schema({
  requestId: { type: String, required: true },
  apiKeyId: { type: Number },
  prompt: { type: String },
  response: { type: String },
  status: { type: String, enum: ["allowed", "blocked", "terminated"], default: "allowed" },
  latencyMs: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

// Every time something gets flagged/blocked — this is what feeds the live dashboard.
const securityEventSchema = new mongoose.Schema({
  requestId: { type: String, required: true },
  apiKeyId: { type: Number },
  type: { type: String }, // 'pii' | 'blocklist' | 'injection' | 'llm_judge'
  severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  matchedText: { type: String },
  reason: { type: String },
  stage: { type: String, enum: ["pre_request", "mid_stream"], default: "pre_request" },
  createdAt: { type: Date, default: Date.now },
});

const RequestLog = mongoose.model("RequestLog", requestLogSchema);
const SecurityEvent = mongoose.model("SecurityEvent", securityEventSchema);

module.exports = { connectMongo, RequestLog, SecurityEvent };
