import { useState, useEffect } from "react";
import { TrendingUp } from "lucide-react";
import ControlPanel from "../components/ControlPanel";
import AgentFlow from "../components/AgentFlow";
import LiveStatus from "../components/LiveStatus";
import ReportViewer from "../components/ReportViewer";
import { getRun, useRuns } from "../hooks/useApi";

export default function Home() {
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runData, setRunData] = useState<any>(null);
  const { runs } = useRuns();

  useEffect(() => {
    if (activeRunId) {
      getRun(activeRunId).then(setRunData).catch(console.error);
    }
  }, [activeRunId]);

  const statusMap: Record<string, string> = runData
    ? {
        Market: runData.market_report ? "completed" : "pending",
        Social: runData.sentiment_report ? "completed" : "pending",
        News: runData.news_report ? "completed" : "pending",
        Fundamentals: runData.fundamentals_report ? "completed" : "pending",
        Bull: runData.investment_debate_state?.bull_history ? "completed" : "pending",
        Bear: runData.investment_debate_state?.bear_history ? "completed" : "pending",
        Manager: runData.investment_plan ? "completed" : "pending",
        Trader: runData.trader_investment_decision ? "completed" : "pending",
        Aggressive: runData.risk_debate_state?.aggressive_history ? "completed" : "pending",
        Neutral: runData.risk_debate_state?.neutral_history ? "completed" : "pending",
        Conservative: runData.risk_debate_state?.conservative_history ? "completed" : "pending",
        "Portfolio Manager": runData.final_trade_decision ? "completed" : "pending",
      }
    : {};

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <TrendingUp size={20} color="#00d4ff" />
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Dashboard</h1>
      </div>

      <ControlPanel onStarted={setActiveRunId} />

      {activeRunId && (
        <>
          <LiveStatus runId={activeRunId} />
          <AgentFlow statusMap={statusMap} />
          {runData && <ReportViewer data={runData} />}
        </>
      )}

      {!activeRunId && runs.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-title">Recent Completed Runs</div>
          <p style={{ color: "#64748b" }}>
            Select a run from <strong>History</strong> to view the full report, or start a new analysis above.
          </p>
        </div>
      )}
    </div>
  );
}
