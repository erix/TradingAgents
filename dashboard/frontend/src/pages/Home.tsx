import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrainCircuit,
  X,
  Loader2,
  Send,
  Square,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AgentFlow from "../components/AgentFlow";
import LiveStatus from "../components/LiveStatus";
import ReportViewer from "../components/ReportViewer";
import { getConfig, getRun, startAnalysis, useRuns } from "../hooks/useApi";
import { useActiveRun } from "../hooks/useActiveRun";
import { useSSE } from "../hooks/useSSE";

type DebateMessage = {
  author: string;
  tone: "bull" | "bear" | "system";
  text: string;
  tags: string[];
  time: string;
};

type Metric = [string, string];
type MessageFilter = "all" | "bull" | "bear" | "trader" | "risk" | "system";
type ExpandedPanel = { title: string; content: string } | null;

const keywordTags = [
  "valuation",
  "revenue",
  "earnings",
  "growth",
  "margin",
  "cash",
  "debt",
  "risk",
  "sentiment",
  "news",
  "technical",
  "fundamental",
];

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[#*_>`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(text: string, max = 220): string {
  const clean = stripMarkdown(text);
  return clean.length > max ? `${clean.slice(0, max).trim()}...` : clean;
}

function splitStatements(text: string, limit = 3): string[] {
  const clean = stripMarkdown(text);
  if (!clean) return [];
  return clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function findReport(reports: any, stage: string, names: string[]): string {
  const bucket = Object.entries(reports || {}).find(([key]) => key.includes(stage))?.[1] as Record<string, string> | undefined;
  if (!bucket) return "";
  const match = Object.entries(bucket).find(([key]) => names.some((name) => key.toLowerCase().includes(name)));
  return toText(match?.[1]);
}

function normalizeRun(raw: any) {
  if (!raw?.run_id) return null;
  const reports = raw.reports || {};
  return {
    ...raw.result,
    ...raw,
    market_report: toText(raw.market_report) || findReport(reports, "analysts", ["market"]),
    sentiment_report: toText(raw.sentiment_report) || findReport(reports, "analysts", ["sentiment", "social"]),
    news_report: toText(raw.news_report) || findReport(reports, "analysts", ["news"]),
    fundamentals_report: toText(raw.fundamentals_report) || findReport(reports, "analysts", ["fundamental"]),
    investment_debate_state: raw.investment_debate_state || {
      bull_history: findReport(reports, "research", ["bull"]),
      bear_history: findReport(reports, "research", ["bear"]),
      judge_decision: findReport(reports, "research", ["manager"]),
    },
    risk_debate_state: raw.risk_debate_state || {
      aggressive_history: findReport(reports, "risk", ["aggressive"]),
      conservative_history: findReport(reports, "risk", ["conservative"]),
      neutral_history: findReport(reports, "risk", ["neutral"]),
      judge_decision: findReport(reports, "risk", ["manager", "portfolio"]),
    },
  };
}

function messageTags(text: string): string[] {
  const lower = text.toLowerCase();
  const tags = keywordTags.filter((tag) => lower.includes(tag)).slice(0, 3);
  return tags.length ? tags.map((tag) => tag[0].toUpperCase() + tag.slice(1)) : ["Analyst Output"];
}

function parseDebate(runData: any): DebateMessage[] {
  const events = (runData?.events || [])
    .filter((event: any) => toText(event?.content) && !["Control"].includes(event?.type))
    .slice(-24)
    .map((event: any, index: number) => {
      const type = toText(event.type) || "System";
      const content = toText(event.content);
      const lower = `${type} ${content}`.toLowerCase();
      const tone = lower.includes("bear") ? "bear" : lower.includes("bull") ? "bull" : "system";
      return {
        author: toText(event.agent) || (type === "Tool Call" ? "Tool Call" : type === "Data" ? "Data Source" : type === "Agent" ? "Agent Output" : type),
        tone,
        text: excerpt(content, 420),
        tags: [type, ...messageTags(content)].slice(0, 3),
        time: toText(event.time) || `Event ${index + 1}`,
      } as DebateMessage;
    });

  if (events.length) return events;

  const debate = runData?.investment_debate_state || {};
  const combined = toText(debate.history);
  const source = combined || [debate.bull_history, debate.bear_history].filter(Boolean).join("\n");
  const parts = source.split(/(?=(?:Bull Analyst|Bear Analyst):)/g).map((part) => part.trim()).filter(Boolean);
  const messages: DebateMessage[] = [];

  parts.forEach((part, index) => {
    const isBear = part.startsWith("Bear Analyst:");
    const isBull = part.startsWith("Bull Analyst:");
    const text = part.replace(/^(Bull Analyst|Bear Analyst):\s*/, "");
    if (!text) return;
    messages.push({
      author: isBear ? "Bear Case Researcher" : isBull ? "Bull Case Researcher" : "Research Team",
      tone: isBear ? "bear" : isBull ? "bull" : "system",
      text: excerpt(text, 360),
      tags: messageTags(text),
      time: `Round ${index + 1}`,
    });
  });

  const judge = toText(debate.judge_decision);
  if (judge) {
    messages.push({
      author: "Research Manager",
      tone: "system",
      text: excerpt(judge, 360),
      tags: ["Investment Plan"],
      time: "Decision",
    });
  }

  return messages;
}

function extractMetrics(text: string): Metric[] {
  const clean = stripMarkdown(text);
  const labels = ["Market Cap", "P/E", "EPS", "ROE", "Revenue", "Debt", "Beta", "Sharpe", "Drawdown", "VaR"];
  const found: Metric[] = [];

  labels.forEach((label) => {
    const pattern = new RegExp(`${label.replace("/", "\\/")}[^\\d$€-]{0,30}([$€]?-?\\d[\\d,.]*\\s?(?:%|K|M|B|T|x)?)`, "i");
    const match = clean.match(pattern);
    if (match?.[1]) found.push([label, match[1]]);
  });

  if (found.length) return found.slice(0, 6);

  const figures = clean.match(/[$€]?-?\d[\d,.]*\s?(?:%|K|M|B|T|x)?/g) || [];
  return figures.slice(0, 6).map((value, index) => [`Figure ${index + 1}`, value]);
}

function sentimentScore(...texts: string[]) {
  const text = texts.join(" ").toLowerCase();
  const positive = (text.match(/bullish|positive|growth|strong|upside|buy|outperform|improve|opportunity/g) || []).length;
  const negative = (text.match(/bearish|negative|risk|decline|weak|sell|downside|concern|pressure/g) || []).length;
  const total = positive + negative;
  const score = total ? Math.round((positive / total) * 100) : 50;
  const label = score >= 60 ? "Bullish" : score <= 40 ? "Bearish" : "Neutral";
  return { score, label, positive, negative };
}

const messageFilters: { id: MessageFilter; label: string }[] = [
  { id: "all", label: "All Messages" },
  { id: "bull", label: "Bull Case" },
  { id: "bear", label: "Bear Case" },
  { id: "trader", label: "Trader" },
  { id: "risk", label: "Risk Manager" },
  { id: "system", label: "System" },
];

function matchesMessageFilter(message: DebateMessage, filter: MessageFilter) {
  if (filter === "all") return true;
  const authorAndTags = `${message.author} ${message.tags.join(" ")}`.toLowerCase();
  const haystack = `${authorAndTags} ${message.text}`.toLowerCase();
  if (filter === "bull") return message.tone === "bull" || authorAndTags.includes("bull");
  if (filter === "bear") return message.tone === "bear" || authorAndTags.includes("bear");
  if (filter === "trader") return haystack.includes("trader") || haystack.includes("investment plan");
  if (filter === "risk") return /risk|aggressive|neutral|conservative|portfolio/.test(haystack);
  return message.tone === "system" || /system|data|tool|source|error|agent output/.test(haystack);
}

export default function Home() {
  const [runData, setRunData] = useState<any>(null);
  const [ticker, setTicker] = useState("AAPL");
  const [tradeDate, setTradeDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [provider, setProvider] = useState("openrouter");
  const [deepModel, setDeepModel] = useState("anthropic/claude-sonnet-4.6");
  const [quickModel, setQuickModel] = useState("openai/gpt-4o-mini");
  const [debateDepth, setDebateDepth] = useState(1);
  const [messageFilter, setMessageFilter] = useState<MessageFilter>("all");
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);
  const [loading, setLoading] = useState(false);
  const messageStreamRef = useRef<HTMLDivElement | null>(null);
  const [cfg, setCfg] = useState<any>(null);
  const { runs } = useRuns();
  const { activeRunId, setActiveRunId, setActiveRun } = useActiveRun();
  const activeListedRun = runs.find((run) => run.run_id === activeRunId);
  const shouldStream = Boolean(activeRunId && (activeListedRun?.source === "memory" || runData?.source === "memory"));
  const { data: streamData } = useSSE<any>(shouldStream ? `/api/runs/${activeRunId}/stream` : null);

  useEffect(() => {
    getConfig().then(setCfg).catch(console.error);
  }, []);

  useEffect(() => {
    if (!activeRunId) return;
    getRun(activeRunId)
      .then((data) => {
        const normalized = normalizeRun(data);
        setRunData(normalized);
        setActiveRun(normalized);
      })
      .catch(console.error);
  }, [activeRunId, setActiveRun]);

  useEffect(() => {
    if (activeRunId || !runs[0]?.run_id) return;
    setActiveRunId(runs[0].run_id);
  }, [activeRunId, runs]);

  useEffect(() => {
    const normalized = normalizeRun(streamData);
    if (normalized) {
      setRunData(normalized);
      setActiveRun(normalized);
    }
  }, [streamData, setActiveRun]);

  useEffect(() => {
    if (!cfg?.models?.[provider]?.length) return;
    const models = cfg.models[provider];
    if (!models.includes(deepModel)) setDeepModel(models[0]);
    if (!models.includes(quickModel)) setQuickModel(models[Math.min(1, models.length - 1)]);
  }, [cfg, provider, deepModel, quickModel]);

  const statusMap = useMemo(
    (): Record<string, string> => {
      if (!runData) return {};
      if (runData.agent_status) {
        const displayNames: Record<string, string> = {
          "Market Analyst": "Market",
          "Social Analyst": "Social",
          "News Analyst": "News",
          "Fundamentals Analyst": "Fundamentals",
          "Bull Researcher": "Bull",
          "Bear Researcher": "Bear",
          "Research Manager": "Manager",
          "Aggressive Analyst": "Aggressive",
          "Neutral Analyst": "Neutral",
          "Conservative Analyst": "Conservative",
          Trader: "Trader",
          "Portfolio Manager": "Portfolio Manager",
        };
        return Object.fromEntries(
          Object.entries(runData.agent_status).map(([agent, status]) => [
            displayNames[agent] || agent,
            status === "in_progress" ? "running" : String(status),
          ])
        );
      }
      const isActive = ["queued", "running"].includes(runData.status);
      return {
            Market: runData.market_report ? "completed" : isActive ? "running" : "pending",
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
          };
    },
    [runData]
  );

  const runLabel = activeRunId || runs[0]?.run_id || `${ticker}_preview`;
  const modelLabel = `${quickModel.split("/").pop()}, ${deepModel.split("/").pop()}`;
  const debateMessages = useMemo(() => parseDebate(runData), [runData]);
  const visibleMessages = useMemo(
    () => debateMessages.filter((message) => matchesMessageFilter(message, messageFilter)),
    [debateMessages, messageFilter]
  );
  const metrics = useMemo(() => extractMetrics(`${runData?.fundamentals_report || ""} ${runData?.market_report || ""}`), [runData]);
  const sentiment = useMemo(
    () => sentimentScore(runData?.sentiment_report || "", runData?.news_report || "", runData?.final_trade_decision || ""),
    [runData]
  );

  useEffect(() => {
    const stream = messageStreamRef.current;
    if (!stream) return;
    stream.scrollTo({ top: stream.scrollHeight, behavior: runData?.status === "running" ? "smooth" : "auto" });
  }, [visibleMessages.length, runData?.status]);

  const handleStart = async () => {
    if (!ticker) return;
    setLoading(true);
    try {
      const res = await startAnalysis({
        ticker: ticker.toUpperCase(),
        trade_date: tradeDate,
        selected_analysts: ["market", "fundamentals", "news", "social"],
        llm_provider: provider,
        deep_think_llm: deepModel,
        quick_think_llm: quickModel,
        max_debate_rounds: debateDepth,
        debug: false,
      });
      if (res.status === "error") {
        alert("Failed to start: " + (res.message || "Unknown error"));
        return;
      }
      setActiveRunId(res.run_id);
      const liveRun = { ...res, source: "memory" };
      setRunData(liveRun);
      setActiveRun(liveRun);
    } catch (e: any) {
      alert("Failed to start: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard">
      <section className="dashboard-main">
        <div className="panel run-config">
          <div className="run-config-title">Run Config</div>
          <div className="config-cell">
            <label>Ticker</label>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} />
          </div>
          <div className="config-cell">
            <label>Trade Date</label>
            <input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} />
          </div>
          <div className="config-cell">
            <label>Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {(cfg?.llm_providers || [provider]).map((p: string) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="config-cell">
            <label>Fast Model</label>
            <select value={quickModel} onChange={(e) => setQuickModel(e.target.value)}>
              {(cfg?.models?.[provider] || [quickModel]).map((m: string) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="config-cell">
            <label>Deep Model</label>
            <select value={deepModel} onChange={(e) => setDeepModel(e.target.value)}>
              {(cfg?.models?.[provider] || [deepModel]).map((m: string) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="config-cell">
            <label>Depth</label>
            <select value={debateDepth} onChange={(e) => setDebateDepth(Number(e.target.value))}>
              <option value={1}>Quick</option>
              <option value={2}>Standard</option>
              <option value={3}>Deep</option>
            </select>
          </div>
          <div className="run-actions">
            <button className="btn btn-primary" onClick={handleStart} disabled={loading}>
              {loading ? <Loader2 className="spin" size={16} /> : <TrendingUp size={16} />}
              {loading ? "Starting" : "Run"}
            </button>
            <button className="btn btn-danger" disabled={!activeRunId}>
              <Square size={14} fill="currentColor" />
              Stop Run
            </button>
          </div>
        </div>

        <div className="panel workspace-panel">
          <div className="workspace-tabs">
            <button className="workspace-tab active">Debate</button>
            <button className="workspace-tab">Analysis</button>
            <button className="workspace-tab">Final Report</button>
            <button className="workspace-tab">Execution Log</button>
          </div>
          <div className="stream-header">
            <strong>Bull Case Researcher vs Bear Case Researcher</strong>
            <span className="live-pill"><span className="pulse" />Live</span>
          </div>
          <div className="message-filters">
            {messageFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`filter-chip ${messageFilter === filter.id ? "active" : ""}`}
                onClick={() => setMessageFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="message-stream" ref={messageStreamRef}>
            {debateMessages.length === 0 && (
              <article className="message-card" style={{ "--agent-color": "#a7b0c4" } as CSSProperties}>
                <BrainCircuit className="message-icon" size={22} />
                <div>
                  <div className="message-author">Waiting for analyst debate</div>
                  <p className="message-text">
                    Start a run or select a completed run with research output to populate this stream from bull and bear analyst history.
                  </p>
                </div>
                <time className="message-time">No data</time>
              </article>
            )}
            {debateMessages.length > 0 && visibleMessages.length === 0 && (
              <article className="message-card" style={{ "--agent-color": "#a7b0c4" } as CSSProperties}>
                <BrainCircuit className="message-icon" size={22} />
                <div>
                  <div className="message-author">No matching messages</div>
                  <p className="message-text">This run has no entries for the selected stream filter.</p>
                </div>
                <time className="message-time">{messageFilter}</time>
              </article>
            )}
            {visibleMessages.map((message, index) => {
              const isBull = message.tone === "bull";
              const isBear = message.tone === "bear";
              const Icon = isBull ? TrendingUp : isBear ? TrendingDown : BrainCircuit;
              return (
                <article
                  key={`${message.author}-${message.time}-${index}`}
                  className="message-card"
                  style={{ "--agent-color": isBull ? "#43e286" : isBear ? "#ff5c67" : "#ffc247" } as CSSProperties}
                >
                  <Icon className="message-icon" size={22} />
                  <div>
                    <div className="message-author">{message.author}</div>
                    <p className="message-text">{message.text}</p>
                    <div className="message-tags">
                      {message.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                    </div>
                  </div>
                  <time className="message-time">{message.time}</time>
                </article>
              );
            })}
          </div>
          <div className="decision-banner">
            <span><BrainCircuit size={18} /> {runData?.final_trade_decision ? excerpt(runData.final_trade_decision, 110) : "Trader is waiting for analyst evidence..."}</span>
            <time>{runData?.status || "idle"}</time>
          </div>
          <div className="prompt-bar">
            <input placeholder="Ask a question or add instructions..." />
            <button aria-label="Send message"><Send size={18} /></button>
          </div>
        </div>

        {activeRunId && runData?.source === "memory" && <LiveStatus runId={activeRunId} />}
        {activeRunId && <AgentFlow statusMap={statusMap} />}
        {runData && <ReportViewer data={runData} />}
      </section>

      <aside className="dashboard-aside">
        <MarketContext ticker={runData?.ticker || ticker} report={runData?.market_report} />
        <KeyMetrics metrics={metrics} />
        <SentimentPanel sentiment={sentiment} runData={runData} />
        <RiskOverview runData={runData} onExpand={setExpandedPanel} />
        <RecentNews report={runData?.news_report} onExpand={setExpandedPanel} />
        <div className="side-panel panel">
          <div className="side-title">Run Reference</div>
          <div className="inline-row"><span>Active ID</span><strong>{runLabel}</strong></div>
          <div className="inline-row"><span>Models</span><strong>{modelLabel}</strong></div>
        </div>
      </aside>
      {expandedPanel && <ExpandedReportModal panel={expandedPanel} onClose={() => setExpandedPanel(null)} />}
    </div>
  );
}

function MarketContext({ ticker, report }: { ticker: string; report?: string }) {
  const statements = splitStatements(report || "", 3);
  const hasData = Boolean(report);
  return (
    <div className={`side-panel panel ${hasData ? "" : "no-data"}`}>
      <div className="side-title">Market Context</div>
      <div style={{ color: "#f3f6fc", fontWeight: 800 }}>{ticker || "Ticker"}</div>
      <div className="quote-row">
        {hasData ? (
          <>
            <span className="quote-price">Report</span>
            <span>Market Analyst</span>
          </>
        ) : (
          <span className="empty-state-badge">No market data yet</span>
        )}
      </div>
      <div className="news-list">
        {(statements.length ? statements : ["Market analyst output will appear here after a run completes."]).map((item, index) => (
          <div key={index} className="inline-row"><span>{index + 1}</span><strong>{item}</strong></div>
        ))}
      </div>
    </div>
  );
}

function KeyMetrics({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="side-panel panel">
      <div className="side-title">Key Metrics</div>
      <div className="metric-grid">
        {(metrics.length ? metrics : [["Fundamentals", "Pending"]]).map(([label, value]) => (
          <div key={label} className="metric-card">
            <div className="metric-label">{label}</div>
            <div className="metric-value">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SentimentPanel({ sentiment, runData }: { sentiment: ReturnType<typeof sentimentScore>; runData: any }) {
  const newsSentiment = sentimentScore(runData?.news_report || "");
  const socialSentiment = sentimentScore(runData?.sentiment_report || "");
  const decisionSentiment = sentimentScore(runData?.final_trade_decision || "");
  return (
    <div className="side-panel panel">
      <div className="side-title">Sentiment</div>
      <div className="sentiment-layout">
        <div className="gauge">
          <div className="gauge-circle">
            <div className="gauge-value">{sentiment.score}</div>
          </div>
          <div style={{ color: "#a7b0c4", marginTop: -20 }}>{sentiment.label}</div>
        </div>
        <div className="sentiment-list">
          <div className="inline-row"><span>News Sentiment</span><strong className={newsSentiment.score >= 50 ? "positive" : "negative"}>{newsSentiment.score} {newsSentiment.label}</strong></div>
          <div className="inline-row"><span>Social Sentiment</span><strong className={socialSentiment.score >= 50 ? "positive" : "negative"}>{socialSentiment.score} {socialSentiment.label}</strong></div>
          <div className="inline-row"><span>Final Consensus</span><strong className={decisionSentiment.score >= 50 ? "positive" : "negative"}>{decisionSentiment.score} {decisionSentiment.label}</strong></div>
        </div>
      </div>
    </div>
  );
}

function RiskOverview({ runData, onExpand }: { runData: any; onExpand: (panel: ExpandedPanel) => void }) {
  const risk = runData?.risk_debate_state || {};
  const rows = [
    ["Aggressive", risk.aggressive_history],
    ["Conservative", risk.conservative_history],
    ["Neutral", risk.neutral_history],
    ["Portfolio", risk.judge_decision || runData?.final_trade_decision],
  ].filter(([, value]) => toText(value));
  const content = rows.length
    ? rows.map(([label, value]) => `## ${label}\n\n${value}`).join("\n\n")
    : "Risk debate output will appear after the risk analysts complete their review.";

  return (
    <div className="side-panel panel">
      <div className="side-title">
        <span>Risk Overview</span>
        <button className="side-action" type="button" onClick={() => onExpand({ title: "Risk Overview", content })}>
          Expand
        </button>
      </div>
      <div className="risk-list">
        {(rows.length ? rows : [["Risk Team", "Risk debate output will appear after the risk analysts complete their review."]]).map(([label, value]) => (
          <div key={label} className="inline-row"><span>{label}</span><strong>{excerpt(value, 95)}</strong></div>
        ))}
      </div>
    </div>
  );
}

function RecentNews({ report, onExpand }: { report?: string; onExpand: (panel: ExpandedPanel) => void }) {
  const items = splitStatements(report || "", 3);
  const content = report || "News analyst output will appear here after a run completes.";
  return (
    <div className="side-panel panel">
      <div className="side-title">
        <span>Recent News</span>
        <button className="side-action" type="button" onClick={() => onExpand({ title: "Recent News", content })}>
          View All
        </button>
      </div>
      <div className="news-list">
        {(items.length ? items : ["News analyst output will appear here after a run completes."]).map((item, index) => (
          <div key={index} className="inline-row"><span>{index + 1}</span><strong>{item}</strong></div>
        ))}
      </div>
    </div>
  );
}

function ExpandedReportModal({ panel, onClose }: { panel: NonNullable<ExpandedPanel>; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="expanded-report panel" role="dialog" aria-modal="true" aria-label={panel.title} onClick={(event) => event.stopPropagation()}>
        <div className="expanded-report-header">
          <h2>{panel.title}</h2>
          <button className="icon-button" type="button" aria-label="Close expanded report" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="expanded-report-body markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{panel.content}</ReactMarkdown>
        </div>
      </section>
    </div>
  );
}
