import ChatDemo from "./components/ChatDemo.jsx";
import AlertsPanel from "./components/AlertsPanel.jsx";

export default function App() {
  return (
    <div className="app">
      <ChatDemo />
      <div className="right-col">
        <AlertsPanel />
      </div>
    </div>
  );
}
