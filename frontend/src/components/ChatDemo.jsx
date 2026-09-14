import { useState, useRef } from "react";

const API_BASE = "https://ai-security-proxy.onrender.com";
// Paste the API key you got from POST /admin/bootstrap here, or wire up a login flow later.
const API_KEY = "sk_proxy_4253c619f69acd4bb50441546fff7cca16dbe6b6ad02cad5";

export default function ChatDemo() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  async function sendMessage() {
    if (!input.trim() || sending) return;
    const userText = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setSending(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: userText }),
      });

      // Non-streaming error responses (blocked pre-request)
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok && contentType.includes("application/json")) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "blocked", text: `🚫 Blocked: ${data.reason || data.error}` },
        ]);
        setSending(false);
        return;
      }

      // Streaming response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiText = "";
      setMessages((prev) => [...prev, { role: "ai", text: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkStr = decoder.decode(value);
        const lines = chunkStr.split("\n").filter((l) => l.startsWith("data:"));

        for (const line of lines) {
          const jsonStr = line.replace(/^data:\s*/, "");
          if (!jsonStr) continue;
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "chunk") {
              aiText += event.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "ai", text: aiText };
                return updated;
              });
            } else if (event.type === "terminated") {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "blocked",
                  text: `⛔ Response cut off mid-stream: ${event.reason}`,
                };
                return updated;
              });
            }
          } catch (e) {
            /* ignore non-JSON lines */
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "blocked", text: `Error: ${err.message}` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="panel">
      <h2>Demo Chat (through your proxy)</h2>
      <div className="chat-messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type a message... try including a fake card number"
        />
        <button onClick={sendMessage} disabled={sending}>
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
