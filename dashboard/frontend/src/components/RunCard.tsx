import { Run } from "../types";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

function signalIcon(signal?: string) {
  const s = signal?.toLowerCase() || "";
  if (s.includes("buy") || s.includes("overweight")) return <ArrowUpRight size={16} color="#00c853" />;
  if (s.includes("sell") || s.includes("underweight")) return <ArrowDownRight size={16} color="#ff5252" />;
  return <Minus size={16} color="#ffab00" />;
}

function badgeClass(signal?: string) {
  const s = signal?.toLowerCase() || "";
  if (s.includes("buy") || s.includes("overweight")) return "badge-buy";
  if (s.includes("sell") || s.includes("underweight")) return "badge-sell";
  return "badge-hold";
}

export default function RunCard({ run, onClick }: { run: Run; onClick: () => void }) {
  const decision = run?.result?.signal || run?.final_trade_decision || "";
  // shorten decision text
  const badgeText = decision
    .split(" ")
    .slice(0, 3)
    .join(" ") || "—";

  return (
    <div className="run-card" onClick={onClick}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="run-card-ticker">{run.ticker}</div>
        {signalIcon(decision)}
      </div>
      <div className="run-card-date">{run.trade_date}</div>
      <div className="run-card-meta">
        <span className={`badge ${badgeClass(decision)}`}>{badgeText}</span>
        {run.source && <span style={{ color: "#64748b" }}>{run.source}</span>}
      </div>
    </div>
  );
}
