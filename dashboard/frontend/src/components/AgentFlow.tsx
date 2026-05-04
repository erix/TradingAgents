const STAGES = [
  { title: "Analysts", agents: ["Market", "Social", "News", "Fundamentals"] },
  { title: "Research", agents: ["Bull", "Bear", "Manager"] },
  { title: "Trading", agents: ["Trader"] },
  { title: "Risk", agents: ["Aggressive", "Neutral", "Conservative"] },
  { title: "Portfolio", agents: ["Portfolio Manager"] },
];

export default function AgentFlow({ statusMap }: { statusMap: Record<string, string> }) {
  return (
    <div className="card">
      <div className="card-title">Agent Pipeline</div>
      <div className="pipeline">
        {STAGES.map((stage) => (
          <div key={stage.title} className="pipeline-stage">
            <div className="pipeline-title">{stage.title}</div>
            {stage.agents.map((a) => {
              const s = statusMap[a] || "pending";
              return (
                <div key={a} className={`agent-box ${s}`}>
                  <span className="agent-dot" />
                  {a}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
