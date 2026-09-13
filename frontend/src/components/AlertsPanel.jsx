import { useEffect, useRef, useState } from "react";

const WS_URL = "ws://localhost:5000";
const API_BASE = "http://localhost:5000";

export default function AlertsPanel() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    // Load recent history first so the panel isn't empty on refresh.
    fetch(`${API_BASE}/admin/events`)
      .then((r) => r.json())
      .then((data) => setEvents(data))
      .catch(() => {});

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (msg) => {
      const payload = JSON.parse(msg.data);
      if (payload.type === "security_event") {
        setEvents((prev) => [payload.data, ...prev].slice(0, 50));
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div className="panel">
      <h2>
        <span className={`status-dot ${connected ? "connected" : "disconnected"}`} />
        Live Security Alerts
      </h2>
      <div className="events-list">
        {events.length === 0 && <p style={{ color: "#6b7280" }}>No alerts yet.</p>}
        {events.map((e, i) => (
          <div className="alert-item" key={e._id || i}>
            <div className="type">
              {e.type} — {e.severity} — {e.stage}
            </div>
            <div>{e.reason}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
