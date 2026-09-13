const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const config = require("../config");
const pool = require("../db/postgres");
const { RequestLog, SecurityEvent } = require("../db/mongo");
const { firewallCheck } = require("../middleware/firewall");
const { llmJudgeCheck } = require("../middleware/llmJudge");
const { broadcast } = require("../websocket/socket");

const router = express.Router();

// Pull the current list of blocked words from Postgres policies table.
async function getBlockedWords() {
  const result = await pool.query(
    `SELECT config_json FROM policies WHERE rule_type = 'blocklist' AND enabled = TRUE`
  );
  return result.rows.flatMap((row) => row.config_json.words || []);
}

async function logSecurityEvent(requestId, apiKeyId, violation, stage) {
  const event = await SecurityEvent.create({
    requestId,
    apiKeyId,
    type: violation.type,
    severity: violation.severity,
    matchedText: violation.matchedText,
    reason: violation.reason,
    stage,
  });
  // Push it live to any connected dashboard the instant it happens.
  broadcast({ type: "security_event", data: event });
  return event;
}

router.post("/", async (req, res) => {
  const requestId = uuidv4();
  const startTime = Date.now();
  const { message } = req.body;
  const apiKeyId = req.apiKey?.id || null;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Request body must include a 'message' string." });
  }

  // ---------- STAGE 1: Pre-request firewall (fast, free, regex-based) ----------
  const blockedWords = await getBlockedWords();
  const violation = firewallCheck(message, blockedWords);

  if (violation) {
    await logSecurityEvent(requestId, apiKeyId, violation, "pre_request");
    await RequestLog.create({
      requestId,
      apiKeyId,
      prompt: message,
      status: "blocked",
      latencyMs: Date.now() - startTime,
    });
    return res.status(403).json({
      error: "Message blocked by security policy.",
      reason: violation.reason,
      type: violation.type,
    });
  }

  // ---------- STAGE 2: LLM-as-judge (slower, smarter, catches reworded attacks) ----------
  const judgeViolation = config.mockMode ? null : await llmJudgeCheck(message);
  if (judgeViolation) {
    await logSecurityEvent(requestId, apiKeyId, judgeViolation, "pre_request");
    await RequestLog.create({
      requestId,
      apiKeyId,
      prompt: message,
      status: "blocked",
      latencyMs: Date.now() - startTime,
    });
    return res.status(403).json({
      error: "Message blocked by AI security judge.",
      reason: judgeViolation.reason,
      type: judgeViolation.type,
    });
  }

  if (!config.anthropicApiKey) {
    return res.status(500).json({ error: "Server missing ANTHROPIC_API_KEY." });
  }

// ---------- MOCK MODE: no real API credits needed ----------
  if (config.mockMode) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Special test trigger: type exactly "TESTKILL" as your message to simulate
    // the AI reply itself leaking something bad mid-stream, so you can test the
    // kill switch without spending real API credits.
    const isKillTest = message.trim().toUpperCase() === "TESTKILL";
    const mockReply = isKillTest
      ? `Sure, here is some info for you. By the way here is a card number I should not say: 4111 1111 1111 1111 and I would keep talking after this but the stream should be killed first.`
      : `This is a MOCK reply (MOCK_MODE=true in .env). Your message was: "${message}". ` +
      `Everything downstream of this point — streaming, mid-stream scanning, logging, and live alerts — ` +
      `is running exactly as it would with a real AI response. Turn off MOCK_MODE once you have API credits.`;

    const blockedWordsForMock = await getBlockedWords();
    let mockFullText = "";
    let slidingWindow = "";
    const SLIDING_WINDOW_SIZE = 200;
    const words = mockReply.split(" ");

    for (const word of words) {
      const piece = word + " ";
      mockFullText += piece;
      slidingWindow = (slidingWindow + piece).slice(-SLIDING_WINDOW_SIZE);

      const midViolation = firewallCheck(slidingWindow, blockedWordsForMock);
      if (midViolation) {
        await logSecurityEvent(requestId, apiKeyId, midViolation, "mid_stream");
        res.write(`data: ${JSON.stringify({ type: "terminated", reason: midViolation.reason })}\n\n`);
        res.end();
        await RequestLog.create({
          requestId,
          apiKeyId,
          prompt: message,
          response: mockFullText,
          status: "terminated",
          latencyMs: Date.now() - startTime,
        });
        broadcast({ type: "stream_terminated", requestId, reason: midViolation.reason, mock: true });
        return;
      }

      res.write(`data: ${JSON.stringify({ type: "chunk", text: piece })}\n\n`);
      await new Promise((r) => setTimeout(r, 40));
    }
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();

    await RequestLog.create({
      requestId,
      apiKeyId,
      prompt: message,
      response: mockFullText,
      status: "allowed",
      latencyMs: Date.now() - startTime,
    });
    broadcast({ type: "request_completed", requestId, latencyMs: Date.now() - startTime, mock: true });
    return;
  }

  // ---------- STAGE 3: Forward to real LLM, streaming, with mid-stream scanning ----------
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let fullReply = "";
  let slidingWindow = ""; // last ~200 chars of streamed text, used for live scanning
  const SLIDING_WINDOW_SIZE = 200;
  let terminated = false;

  try {
    console.log(`[${requestId}] Forwarding to Anthropic, model=${config.llmModel}...`);
    const upstream = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: config.llmModel,
        max_tokens: 1024,
        stream: true,
        messages: [{ role: "user", content: message }],
      },
      {
        headers: {
          "x-api-key": config.anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        responseType: "stream",
        timeout: 20000,
      }
    );
    console.log(`[${requestId}] Upstream connected, streaming...`);

    upstream.data.on("data", async (chunk) => {
      if (terminated) return;

      const lines = chunk.toString().split("\n").filter((l) => l.startsWith("data:"));
      for (const line of lines) {
        const jsonStr = line.replace(/^data:\s*/, "");
        if (jsonStr === "[DONE]" || !jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);
          if (event.type === "content_block_delta" && event.delta?.text) {
            const textPiece = event.delta.text;
            fullReply += textPiece;
            slidingWindow = (slidingWindow + textPiece).slice(-SLIDING_WINDOW_SIZE);

            // ---- Mid-stream firewall check on the recent window ----
            const midViolation = firewallCheck(slidingWindow, blockedWords);
            if (midViolation && !terminated) {
              terminated = true;
              await logSecurityEvent(requestId, apiKeyId, midViolation, "mid_stream");
              res.write(
                `data: ${JSON.stringify({ type: "terminated", reason: midViolation.reason })}\n\n`
              );
              res.end();
              upstream.data.destroy(); // stop pulling from the LLM
              await RequestLog.create({
                requestId,
                apiKeyId,
                prompt: message,
                response: fullReply,
                status: "terminated",
                latencyMs: Date.now() - startTime,
              });
              broadcast({ type: "stream_terminated", requestId, reason: midViolation.reason });
              return;
            }

            // Forward the clean token to the client.
            res.write(`data: ${JSON.stringify({ type: "chunk", text: textPiece })}\n\n`);
          }
        } catch (e) {
          // Ignore lines that aren't valid JSON (e.g. event: type lines)
        }
      }
    });

    upstream.data.on("end", async () => {
      if (terminated) return;
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
      await RequestLog.create({
        requestId,
        apiKeyId,
        prompt: message,
        response: fullReply,
        status: "allowed",
        latencyMs: Date.now() - startTime,
      });
      broadcast({ type: "request_completed", requestId, latencyMs: Date.now() - startTime });
    });

    upstream.data.on("error", (err) => {
      console.error("Upstream stream error:", err.message);
      if (!res.writableEnded) res.end();
    });
  } catch (err) {
    let errorDetails = err.message;
    if (err.response?.data && typeof err.response.data.on === "function") {
      errorDetails = await new Promise((resolve) => {
        let raw = "";
        err.response.data.on("data", (chunk) => (raw += chunk.toString()));
        err.response.data.on("end", () => resolve(raw));
        err.response.data.on("error", () => resolve(err.message));
      });
    }
    console.error("Failed to reach LLM provider:", errorDetails);
    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to reach LLM provider.", details: errorDetails });
    } else {
      res.end();
    }
  }
});

module.exports = router;
