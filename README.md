# AI-Powered Security Reverse Proxy & Observability Platform

A full-stack reverse proxy that sits between client applications and an LLM provider
(Anthropic), inspecting every request and streaming response in real time. It blocks
PII, prompt-injection attempts, and policy-violating content, catches attacks that
simple pattern matching would miss using a secondary "LLM-as-judge" check, and gives
you a live dashboard of everything happening.

## Architecture

```
Client  →  Proxy (Node/Express)  →  Anthropic API
              │
              ├─ Pre-request firewall (PII / blocklist / injection regex)
              ├─ LLM-as-judge (catches reworded attacks regex misses)
              ├─ Mid-stream scanner (can kill a response while it's generating)
              ├─ PostgreSQL   → users, api_keys, policies, rate limits
              ├─ MongoDB      → request_logs, security_events
              └─ WebSocket    → pushes live alerts to the React dashboard
```

## Tech stack

- **Backend:** Node.js, Express, `ws` (WebSockets), `pg`, `mongoose`
- **Frontend:** React + Vite
- **Databases:** PostgreSQL (structured/relational), MongoDB (logs/events)
- **LLM Provider:** Anthropic API (streaming + a secondary judge call)

## Project structure

```
ai-security-proxy/
├── package.json
├── .env.example
├── src/
│   ├── server.js              # main entry point
│   ├── config.js
│   ├── db/
│   │   ├── postgres.js
│   │   ├── initPostgres.js    # run once to create tables
│   │   └── mongo.js
│   ├── middleware/
│   │   ├── auth.js            # API key check
│   │   ├── rateLimit.js
│   │   ├── firewall.js        # PII / blocklist / injection regex detectors
│   │   └── llmJudge.js        # secondary AI-based classifier
│   ├── routes/
│   │   ├── chat.js            # the core streaming proxy endpoint
│   │   └── admin.js           # bootstrap, policies, keys, logs
│   └── websocket/
│       └── socket.js
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        └── components/
            ├── ChatDemo.jsx
            └── AlertsPanel.jsx
```

## Setup

### 1. Backend

```bash
cd ai-security-proxy
npm install
cp .env.example .env
```

Edit `.env`:
- Add your `ANTHROPIC_API_KEY`
- Set your Postgres and MongoDB connection details (defaults assume local instances)
- Set an `ADMIN_BOOTSTRAP_SECRET` (any string you choose)

Create the Postgres tables:
```bash
npm run init-db
```

Start the server:
```bash
npm start
```

You should see:
```
✅ AI Security Proxy running at http://localhost:5000
```

### 2. Create your first API key

```bash
curl -X POST http://localhost:5000/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"secret": "your_admin_bootstrap_secret", "email": "you@example.com"}'
```

This returns an `apiKey` — copy it.

### 3. Frontend

```bash
cd frontend
npm install
```

Open `frontend/src/components/ChatDemo.jsx` and paste your API key into `API_KEY`.

```bash
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`).

## How the security works

1. **Pre-request firewall** (`src/middleware/firewall.js`) — instant regex checks for
   card numbers, emails, phone numbers, blocked keywords, and known prompt-injection
   phrasings. Free and fast, runs on every request before it touches the AI.

2. **LLM-as-judge** (`src/middleware/llmJudge.js`) — a second, cheap AI call that reads
   the message and classifies whether it's trying to manipulate/jailbreak the system.
   This catches creatively reworded attacks that regex patterns miss. Fails open (skips
   itself) if the API call fails, so a hiccup here never fully blocks legitimate traffic.

3. **Mid-stream scanning** (`src/routes/chat.js`) — as the AI's reply streams back
   token-by-token, a sliding window of the last ~200 characters is re-scanned with the
   same firewall checks. If something bad appears mid-reply, the stream is aborted
   immediately and the client is told why.

4. **Explainability** — every block records `type`, `severity`, `matchedText`, and
   `reason`, both in MongoDB and pushed live over WebSocket, so the dashboard always
   shows *why* something was blocked, not just that it was.

## Why two databases

- **PostgreSQL** — users, API keys, policies, and rate-limit counters. This data needs
  strong consistency (you can't let two simultaneous requests both slip past a rate
  limit due to a race condition), and it benefits from relational structure (a user has
  many keys, a key has a rate limit).
- **MongoDB** — request logs and security events. This is high-volume, write-heavy, and
  the shape of a "security event" varies by detection type. Document storage fits that
  better than rigid relational migrations every time a new rule type is added.

## Known limitations (honest, for your viva)

- Detection is regex + one LLM-judge call — not a trained ML classifier.
- Rate limiting is a simple fixed-window counter, not a sliding-window/token-bucket algorithm.
- No refresh-token/session auth — API keys are static bearer tokens.
- Admin routes (except bootstrap) aren't authenticated yet — add auth before any real deployment.
- Not production-hardened (no HTTPS termination, no horizontal scaling considerations).

## Next steps / ideas to extend further

- Add vector-embedding-based semantic injection detection
- Add per-policy multi-tenant configuration (different rules per client)
- Add a stream replay feature in the dashboard using the stored `RequestLog` data
- Containerize with Docker for one-command setup
