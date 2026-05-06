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
            {state.progress?.completed_agents != null && (
              <span>Agents: {state.progress.completed_agents}/{state.progress.total_agents}</span>
            )}
            {state.stats && (
              <span>LLM: {state.stats.llm_calls} | Tools: {state.stats.tool_calls}</span>
            )}
            {state.result?.signal && (
              <span style={{ color: "#00c853" }}>Signal: {state.result.signal}</span>
            )}
          </div>

          {(state.events || state.messages) && (
            <div className="log-stream">
              {(state.events || state.messages.map((content: string) => ({ content, type: "System" }))).slice(-80).map((event: any, i: number) => (
                <div key={i} className="log-line">
                  <span>{event.time || "--:--:--"}</span>
                  <strong>{event.type || "System"}</strong>
                  <span>{event.content}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
