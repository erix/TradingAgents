import { useNavigate } from "react-router-dom";
import { History } from "lucide-react";
import { useRuns } from "../hooks/useApi";
import RunCard from "../components/RunCard";

export default function HistoryPage() {
  const { runs, loading, error } = useRuns();
  const navigate = useNavigate();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <History size={20} color="#00d4ff" />
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Run History</h1>
      </div>

      {loading && <p style={{ color: "#64748b" }}>Loading runs...</p>}
      {error && <p style={{ color: "#ff5252" }}>Error: {error}</p>}

      <div className="run-grid">
        {runs.map((run) => (
          <RunCard key={run.run_id} run={run} onClick={() => navigate(`/run/${run.run_id}`)} />
        ))}
      </div>

      {!loading && runs.length === 0 && (
        <div className="card">
          <p style={{ color: "#64748b" }}>No historical runs found. Start your first analysis from the Dashboard.</p>
        </div>
      )}
    </div>
  );
}
