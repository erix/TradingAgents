import { Activity } from "lucide-react";

export default function Live() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Activity size={20} color="#00d4ff" />
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Live Status</h1>
      </div>
      <div className="card">
        <p style={{ color: "#64748b" }}>
          Start an analysis run from the Dashboard to see live agent progress here.
        </p>
      </div>
    </div>
  );
}
