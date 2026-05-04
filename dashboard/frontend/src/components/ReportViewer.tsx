import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ReportViewer({ data }: { data: any }) {
  const [tab, setTab] = useState("decision");

  const sections: Record<string, string | undefined> = {
    decision: data?.final_trade_decision || "No decision yet",
    plan: data?.investment_plan || undefined,
    market: data?.market_report || undefined,
    fundamentals: data?.fundamentals_report || undefined,
    sentiment: data?.sentiment_report || undefined,
    news: data?.news_report || undefined,
    trader: data?.trader_investment_decision || undefined,
  };

  const available = Object.entries(sections).filter(([, v]) => v);

  return (
    <div className="card">
      <div className="card-title">Reports</div>
      <div className="report-tabs">
        {available.map(([key]) => (
          <button
            key={key}
            className={`report-tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>
      <div className="markdown-body">
        {tab && sections[tab] ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{sections[tab]}</ReactMarkdown>
        ) : (
          <p style={{ color: "#64748b" }}>Select a report tab to view content.</p>
        )}
      </div>
    </div>
  );
}
