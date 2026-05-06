import type { CSSProperties } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  BrainCircuit,
  FileText,
  LayoutDashboard,
  Newspaper,
  Plus,
  Shield,
  Terminal,
  TrendingUp,
  Users,
} from "lucide-react";
import { useRuns } from "../hooks/useApi";
import { useActiveRun } from "../hooks/useActiveRun";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/history", label: "History", icon: BarChart3 },
  { to: "/live", label: "Live Status", icon: Activity },
];

const nodes = [
  { id: "pm", key: "final_trade_decision", label: "Portfolio Manager", icon: Users, color: "#8a73ff", x: 72, y: 22 },
  { id: "fund", key: "fundamentals_report", label: "Fundamental Analyst", icon: Users, color: "#68a1ff", x: 0, y: 108 },
  { id: "sent", key: "sentiment_report", label: "Sentiment Analyst", icon: BrainCircuit, color: "#e055c8", x: 78, y: 108 },
  { id: "news", key: "news_report", label: "News Analyst", icon: Newspaper, color: "#f6a13d", x: 156, y: 108 },
  { id: "tech", key: "market_report", label: "Technical Analyst", icon: Bot, color: "#28d6c5", x: 82, y: 210 },
  { id: "bull", key: "bull_history", label: "Bull Case Researcher", icon: TrendingUp, color: "#43e286", x: 8, y: 296 },
  { id: "bear", key: "bear_history", label: "Bear Case Researcher", icon: BrainCircuit, color: "#ff5c67", x: 148, y: 296 },
  { id: "trader", key: "trader_investment_decision", label: "Trader", icon: BarChart3, color: "#ffc247", x: 78, y: 392 },
  { id: "risk", key: "risk_debate_state", label: "Risk Manager", icon: Shield, color: "#9d73ff", x: 72, y: 460 },
];

const linksMap = [
  [120, 70, 48, 116],
  [120, 70, 130, 116],
  [120, 70, 212, 116],
  [48, 156, 130, 218],
  [130, 156, 130, 218],
  [212, 156, 130, 218],
  [130, 258, 56, 304],
  [130, 258, 204, 304],
  [56, 344, 126, 400],
  [204, 344, 126, 400],
  [126, 440, 126, 468],
];

function linkStyle([x1, y1, x2, y2]: number[]): CSSProperties {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
  return { width: length, left: x1, top: y1, transform: `rotate(${angle}deg)` };
}

export default function Sidebar() {
  const { runs } = useRuns();
  const { activeRun } = useActiveRun();
  const latestRun = activeRun || runs[0];
  const isRunning = ["queued", "running"].includes(latestRun?.status);
  const createdAt = latestRun?.created_at ? new Date(latestRun.created_at).toLocaleString() : latestRun?.trade_date || "--";

  const hasNodeData = (key: string) => {
    if (!latestRun) return false;
    if (key === "bull_history") return Boolean(latestRun.investment_debate_state?.bull_history);
    if (key === "bear_history") return Boolean(latestRun.investment_debate_state?.bear_history);
    if (key === "risk_debate_state") return Boolean(latestRun.risk_debate_state?.history || latestRun.risk_debate_state?.judge_decision);
    return Boolean(latestRun[key]);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <svg className="logo-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path d="M7 40 22 8h6l15 32h-8L25 18 15 40H7Z" fill="currentColor" opacity=".92" />
          <path d="M25 18 35 40h-9l-6-13 5-9Z" fill="#9b8cff" />
        </svg>
        <div>
          <div className="brand-title">TradingAgents</div>
          <div className="brand-kicker">AI Trading Firm</div>
        </div>
      </div>

      <section className="sidebar-section">
        <div className="section-heading">
          <span>Agent Topology</span>
          <button className="icon-button" aria-label="Add agent"><Plus size={16} /></button>
        </div>
        <p className="section-note">
          {latestRun ? "Mirrors the active run: active nodes pulse, completed nodes stay lit." : "Topology preview. Start a run to activate live agent states."}
        </p>
        <div className="agent-map">
          {linksMap.map((coords, index) => (
            <span key={index} className="agent-link" style={linkStyle(coords)} />
          ))}
          {nodes.map(({ id, key, label, icon: Icon, color, x, y }, index) => (
            <div
              key={id}
              className={`agent-node ${hasNodeData(key) ? "completed" : isRunning && index === 1 ? "running" : "idle"}`}
              style={{ "--node-color": color, left: x, top: y } as CSSProperties}
            >
              <Icon className="node-icon" size={18} />
              <span className="node-label">{label}</span>
              <span className="node-dot" />
            </div>
          ))}
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-heading">System Status</div>
        <div className="system-list">
          <div className="system-row"><span><span className={isRunning ? "pulse" : ""} />Active Run</span><strong>{latestRun?.run_id || "No runs"}</strong></div>
          <div className="system-row"><span><Activity size={14} color="#43e286" />Status</span><strong className={latestRun?.status === "failed" ? "negative" : "positive"}>{latestRun?.status || "Idle"}</strong></div>
          <div className="system-row"><span><Terminal size={14} color="#61a8ff" />Ticker</span><strong>{latestRun?.ticker || "--"}</strong></div>
          <div className="system-row"><span><BrainCircuit size={14} color="#ff5c67" />Run Date</span><strong>{createdAt}</strong></div>
          <div className="system-row"><span><Bot size={14} color="#9d73ff" />Source</span><strong>{latestRun?.source || "--"}</strong></div>
        </div>
        <button className="btn btn-secondary" style={{ width: "100%", marginTop: 14 }}>
          <Terminal size={16} />
          View Execution Log
        </button>
      </section>

      <nav className="nav-list" aria-label="Primary">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} title={label}>
            <Icon size={18} />
          </NavLink>
        ))}
        <button className="nav-item" title="Reports" aria-label="Reports"><FileText size={18} /></button>
        <button className="nav-item" title="Notifications" aria-label="Notifications"><Bell size={18} /></button>
      </nav>
    </aside>
  );
}
