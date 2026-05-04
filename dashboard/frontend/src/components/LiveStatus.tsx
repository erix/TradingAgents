import { useSSE } from "../hooks/useSSE";

export default function LiveStatus({ runId }: { runId: string }) {
  const { data, connected } = useSSE(`/api/runs/${runId}/stream`);

  if (!runId) return null;

  const state = data as any;

  return (
    <div className="card">
      <div className="card-title">
        Live Run: {runId}
        {!connected && <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>(offline)</span>}
      </div>
      {state && (
        <>
          <div className="status-bar">
            <div className="status-indicator">
              {state.status === "running" && <span className="pulse" />}
              <strong>{(state.status || "queued").toUpperCase()}</strong>
            </div>
            {state.progress?.step && <span>Step: {state.progress.step}</span>}
            {state.result?.signal && (
              <span style={{ color: "#00c853" }}>Signal: {state.result.signal}</span>
            )}
          </div>

          {state.messages && (
            <div className="log-stream">
              {state.messages.map((m: string, i: number) => (
                <div key={i} className="log-line">› {m}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
