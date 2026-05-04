import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, TrendingUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getRun } from "../hooks/useApi";

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("decision");

  useEffect(() => {
    if (!runId) return;
    getRun(runId)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [runId]);

  if (loading) return <div className="content"><p>Loading run...</p></div>;
  if (error) return <div className="content"><p style={{ color: "#ff5252" }}>{error}</p></div>;

  const sections: Record<string, string> = {
    decision: data?.final_trade_decision || "N/A",
    plan: data?.investment_plan || "N/A",
    market: data?.market_report || "N/A",
    sentiment: data?.sentiment_report || "N/A",
    news: data?.news_report || "N/A",
    fundamentals: data?.fundamentals_report || "N/A",
    trader: data?.trader_investment_decision || "N/A",
    ...Object.fromEntries(
      Object.entries(data?.reports || {}).flatMap(([stage, files]: [string, any]) =>
        Object.entries(files).map(([name, content]) => [`${stage}/${name}`, content as string])
      )
    ),
  };

  const signal = data?.final_trade_decision || "";
  const sigClass = signal.toLowerCase().includes("buy") || signal.toLowerCase().includes("overweight")
    ? "signal-buy"
    : signal.toLowerCase().includes("sell") || signal.toLowerCase().includes("underweight")
    ? "signal-sell"
    : "signal-hold";
  const sigShort = signal.split(" ").slice(0, 2).join(" ") || "N/A";

  return (
    <div>
      <button className="btn btn-secondary" style={{ marginBottom: 16 }} onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Back
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <TrendingUp size={20} color="#00d4ff" />
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Run: {runId}</h1>
      </div>

      <div className="signal-card" style={{ marginBottom: 20 }}>
        <div className={`signal-badge ${sigClass}`}>{sigShort.charAt(0)}</div>
        <div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>FINAL SIGNAL</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{sigShort}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Reports</div>
        <div className="report-tabs">
          {Object.entries(sections).filter(([, v]) => v && v !== "N/A").map(([key]) => (
            <button
              key={key}
              className={`report-tab ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {key.charAt(0).toUpperCase() + key.slice(1).replace("/", " → ")}
            </button>
          ))}
        </div>
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{sections[tab] || "N/A"}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
