import { useState, useEffect } from "react";
import { Play, Loader2 } from "lucide-react";
import { getConfig, startAnalysis } from "../hooks/useApi";

const ANALYSTS = [
  { key: "market", label: "Market" },
  { key: "social", label: "Social" },
  { key: "news", label: "News" },
  { key: "fundamentals", label: "Fundamentals" },
];

export default function ControlPanel({ onStarted }: { onStarted: (id: string) => void }) {
  const [ticker, setTicker] = useState("SPY");
  const [tradeDate, setTradeDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedAnalysts, setSelectedAnalysts] = useState<string[]>(["market", "fundamentals", "news", "social"]);
  const [provider, setProvider] = useState("openrouter");
  const [deepModel, setDeepModel] = useState("anthropic/claude-3.5-sonnet");
  const [quickModel, setQuickModel] = useState("openai/gpt-4o-mini");
  const [debateRounds, setDebateRounds] = useState(1);
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<any>(null);

  useEffect(() => {
    getConfig().then(setCfg).catch(console.error);
  }, []);

  const toggleAnalyst = (key: string) => {
    setSelectedAnalysts((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleStart = async () => {
    if (!ticker || selectedAnalysts.length === 0) return;
    setLoading(true);
    try {
      const res = await startAnalysis({
        ticker: ticker.toUpperCase(),
        trade_date: tradeDate,
        selected_analysts: selectedAnalysts,
        llm_provider: provider,
        deep_think_llm: deepModel,
        quick_think_llm: quickModel,
        max_debate_rounds: debateRounds,
        debug: false,
      });
      if (res.status === "error") {
        alert("Failed to start: " + (res.message || "Unknown error"));
        return;
      }
      onStarted(res.run_id);
    } catch (e: any) {
      alert("Failed to start: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title">Control Panel</div>

      <div className="form-row">
        <div className="form-group">
          <label>Ticker</label>
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="SPY" />
        </div>
        <div className="form-group">
          <label>Trade Date</label>
          <input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>LLM Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {cfg?.llm_providers?.map((p: string) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Deep Think Model</label>
          <select value={deepModel} onChange={(e) => setDeepModel(e.target.value)}>
            {(cfg?.models?.[provider] || []).map((m: string) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Quick Think Model</label>
          <select value={quickModel} onChange={(e) => setQuickModel(e.target.value)}>
            {(cfg?.models?.[provider] || []).map((m: string) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>Analysts</label>
        <div className="checkbox-group">
          {ANALYSTS.map(({ key, label }) => (
            <div
              key={key}
              className={`checkbox-item ${selectedAnalysts.includes(key) ? "active" : ""}`}
              onClick={() => toggleAnalyst(key)}
            >
              <input type="checkbox" checked={selectedAnalysts.includes(key)} readOnly />
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group" style={{ maxWidth: 200 }}>
          <label>Debate Rounds</label>
          <input type="number" min={0} max={5} value={debateRounds} onChange={(e) => setDebateRounds(parseInt(e.target.value) || 0)} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button className="btn btn-primary" onClick={handleStart} disabled={loading}>
          {loading ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
          {loading ? " Starting..." : " Run Analysis"}
        </button>
      </div>
    </div>
  );
}
