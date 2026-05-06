"""
TradingAgents Dashboard — FastAPI Backend
Serves agent data, triggers runs, streams status via SSE.
"""
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ── Load .env before anything else ───────────────────────────────────────
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[2] / ".env")  # project root .env

# ── Ensure the parent project is importable ────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # dashboard/backend/../../trading-agents
sys.path.insert(0, str(PROJECT_ROOT))

from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG
from cli.stats_handler import StatsCallbackHandler

# ── Frontend build dir ─────────────────────────────────────────────────────
FRONTEND_BUILD = Path(__file__).resolve().parent.parent / "frontend" / "dist"

# ── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="TradingAgents Dashboard API",
    version="1.0.0",
    description="Control panel and results viewer for the TradingAgents multi-agent framework",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Providers ───────────────────────────────────────────────────────────────

# ── Fetch OpenRouter models (cached) ───────────────────────────────────────
_openrouter_models: List[str] = []


def _load_openrouter_models():
    """Fetch current model list from OpenRouter API (no auth needed)."""
    global _openrouter_models
    try:
        r = httpx.get("https://openrouter.ai/api/v1/models", timeout=15)
        r.raise_for_status()
        data = r.json()
        models = []
        for m in data.get("data", []):
            id_ = m.get("id", "")
            name = m.get("name", "")
            if id_ and not id_.startswith("nousresearch/") and "vision" not in name.lower():
                models.append(id_)
        _openrouter_models = sorted(models, key=lambda x: (x.split("/")[0], x))
        print(f"[INFO] Fetched {len(_openrouter_models)} models from OpenRouter")
    except Exception as exc:
        import sys
        print(f"[WARN] Could not fetch OpenRouter models: {exc}", file=sys.stderr)
        _openrouter_models = [
            "anthropic/claude-sonnet-4.6",
            "anthropic/claude-3-opus",
            "openai/gpt-4o",
            "openai/gpt-4o-mini",
            "openai/o1-mini",
            "deepseek/deepseek-chat",
            "google/gemini-1.5-pro",
            "meta-llama/llama-3.1-405b-instruct",
            "nvidia/llama-3.1-nemotron-70b-instruct",
            "mistralai/mistral-large",
        ]


# In-memory run store (simple persistence; replace with Redis in prod)
RUNS: Dict[str, Dict[str, Any]] = {}

ANALYST_ORDER = ["market", "social", "news", "fundamentals"]
ANALYST_AGENT_NAMES = {
    "market": "Market Analyst",
    "social": "Social Analyst",
    "news": "News Analyst",
    "fundamentals": "Fundamentals Analyst",
}
ANALYST_REPORT_MAP = {
    "market": "market_report",
    "social": "sentiment_report",
    "news": "news_report",
    "fundamentals": "fundamentals_report",
}
# ── Provider → API key env var mapping ─────────────────────────────────────
PROVIDER_KEYS = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GOOGLE_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "qwen": "DASHSCOPE_API_KEY",
    "glm": "ZHIPU_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "xai": "XAI_API_KEY",
}

# Load OpenRouter models at module import time
_load_openrouter_models()

# ── Models ──────────────────────────────────────────────────────────────────

CONFIG = DEFAULT_CONFIG.copy()
CONFIG["results_dir"] = os.getenv("TRADINGAGENTS_RESULTS_DIR", os.path.join(os.path.expanduser("~"), ".tradingagents", "logs"))

class RunConfig(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20)
    trade_date: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    selected_analysts: List[str] = Field(default=["market", "fundamentals", "news", "social"])
    deep_think_llm: str = "gpt-5.4-mini"
    quick_think_llm: str = "gpt-5.4-mini"
    llm_provider: str = "openai"
    max_debate_rounds: int = 1
    debug: bool = False

class RunResponse(BaseModel):
    run_id: str
    status: str
    ticker: str
    trade_date: str
    created_at: str

# ── Helpers ─────────────────────────────────────────────────────────────────

def get_reports_dir() -> Path:
    return Path(CONFIG["results_dir"])

def scan_historical_runs() -> List[Dict[str, Any]]:
    """Scan ~/.tradingagents/logs and local project reports for historical run files."""
    roots = [
        Path(CONFIG["results_dir"]),
        PROJECT_ROOT / "reports",
    ]
    runs = []
    for root in roots:
        if not root.exists():
            continue
        for item in root.iterdir():
            if not item.is_dir():
                continue

            # Case 1: ticker subdir with TradingAgentsStrategy_logs (standard JSON logs)
            logs_dir = item / "TradingAgentsStrategy_logs"
            if logs_dir.exists():
                for file in logs_dir.glob("full_states_log_*.json"):
                    date_str = file.stem.replace("full_states_log_", "")
                    runs.append({
                        "run_id": f"{item.name}_{date_str}",
                        "ticker": item.name,
                        "trade_date": date_str,
                        "path": str(file),
                        "source": "json_log",
                    })
                continue

            # Case 2: CLI-generated reports dir (TICKER_YYYYMMDD_HHMMSS)
            if any(stage.name.startswith(("1_", "2_", "3_", "4_", "5_")) for stage in item.iterdir() if stage.is_dir()):
                name = item.name
                if "_" in name:
                    parts = name.split("_", 1)
                    ticker = parts[0]
                    trade_date = parts[1] if len(parts) > 1 else "unknown"
                    runs.append({
                        "run_id": name,
                        "ticker": ticker,
                        "trade_date": trade_date,
                        "path": str(item),
                        "source": "md_reports",
                    })

    # Deduplicate
    seen = set()
    unique = []
    for r in runs:
        if r["run_id"] not in seen:
            seen.add(r["run_id"])
            unique.append(r)
    return sorted(unique, key=lambda x: x["trade_date"], reverse=True)

def utc_time() -> str:
    return datetime.now().strftime("%H:%M:%S")

def is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())

def extract_content_string(content: Any) -> Optional[str]:
    if is_blank(content):
        return None
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, dict):
        text = content.get("text")
        return text.strip() if isinstance(text, str) and text.strip() else None
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item.strip())
            elif isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text", "")).strip())
        text = " ".join(part for part in parts if part)
        return text or None
    return str(content).strip() or None

def classify_message(message: Any) -> tuple[str, Optional[str]]:
    class_name = message.__class__.__name__
    content = extract_content_string(getattr(message, "content", None))
    if class_name == "HumanMessage":
        return ("Control" if content == "Continue" else "User", content)
    if class_name == "ToolMessage":
        return ("Data", content)
    if class_name == "AIMessage":
        return ("Agent", content)
    return ("System", content)

def append_event(run: Dict[str, Any], event_type: str, content: str, agent: Optional[str] = None):
    if not content.strip():
        return
    events = run.setdefault("events", [])
    events.append({
        "time": utc_time(),
        "type": event_type,
        "agent": agent,
        "content": content,
    })
    del events[:-200]

def initialize_agent_status(selected_analysts: List[str]) -> Dict[str, str]:
    status = {}
    for analyst in ANALYST_ORDER:
        if analyst in selected_analysts:
            status[ANALYST_AGENT_NAMES[analyst]] = "pending"
    status.update({
        "Bull Researcher": "pending",
        "Bear Researcher": "pending",
        "Research Manager": "pending",
        "Trader": "pending",
        "Aggressive Analyst": "pending",
        "Neutral Analyst": "pending",
        "Conservative Analyst": "pending",
        "Portfolio Manager": "pending",
    })
    return status

def set_agent_status(run: Dict[str, Any], agent: str, status: str):
    if agent in run.get("agent_status", {}):
        run["agent_status"][agent] = status

def update_progress(run: Dict[str, Any], step: str):
    statuses = run.get("agent_status", {})
    completed = sum(1 for status in statuses.values() if status == "completed")
    running = [agent for agent, status in statuses.items() if status in ("running", "in_progress")]
    total = len(statuses)
    run["progress"] = {
        "step": step,
        "active_agent": running[0] if running else None,
        "completed_agents": completed,
        "total_agents": total,
        "reports_completed": sum(1 for key in ("market_report", "sentiment_report", "news_report", "fundamentals_report", "investment_plan", "trader_investment_plan", "final_trade_decision") if run.get(key)),
    }

def update_analyst_statuses(run: Dict[str, Any], chunk: Dict[str, Any], selected_analysts: List[str]):
    found_active = False
    for analyst_key in ANALYST_ORDER:
        if analyst_key not in selected_analysts:
            continue

        agent_name = ANALYST_AGENT_NAMES[analyst_key]
        report_key = ANALYST_REPORT_MAP[analyst_key]
        if chunk.get(report_key):
            run[report_key] = chunk[report_key]
            run.setdefault("report_sections", {})[report_key] = chunk[report_key]

        if run.get(report_key):
            set_agent_status(run, agent_name, "completed")
        elif not found_active:
            set_agent_status(run, agent_name, "running")
            found_active = True
        else:
            set_agent_status(run, agent_name, "pending")

    if not found_active and selected_analysts:
        set_agent_status(run, "Bull Researcher", "running")

def update_research_statuses(run: Dict[str, Any], debate_state: Dict[str, Any]):
    bull = str(debate_state.get("bull_history", "") or "").strip()
    bear = str(debate_state.get("bear_history", "") or "").strip()
    judge = str(debate_state.get("judge_decision", "") or "").strip()
    if bull or bear:
        set_agent_status(run, "Bull Researcher", "running")
        set_agent_status(run, "Bear Researcher", "running")
        set_agent_status(run, "Research Manager", "running")
    if bull:
        set_agent_status(run, "Bull Researcher", "completed")
    if bear:
        set_agent_status(run, "Bear Researcher", "completed")
    if judge:
        set_agent_status(run, "Research Manager", "completed")
        set_agent_status(run, "Trader", "running")
        run["investment_plan"] = judge
        run.setdefault("report_sections", {})["investment_plan"] = judge

def update_risk_statuses(run: Dict[str, Any], risk_state: Dict[str, Any]):
    mapping = [
        ("aggressive_history", "Aggressive Analyst"),
        ("neutral_history", "Neutral Analyst"),
        ("conservative_history", "Conservative Analyst"),
    ]
    for key, agent in mapping:
        if str(risk_state.get(key, "") or "").strip():
            set_agent_status(run, agent, "completed")
        elif run.get("trader_investment_plan") or run.get("trader_investment_decision"):
            set_agent_status(run, agent, "running")
    if str(risk_state.get("judge_decision", "") or "").strip():
        set_agent_status(run, "Portfolio Manager", "completed")
        run["final_trade_decision"] = risk_state["judge_decision"]
        run.setdefault("report_sections", {})["final_trade_decision"] = risk_state["judge_decision"]

def process_stream_chunk(run: Dict[str, Any], chunk: Dict[str, Any], selected_analysts: List[str], processed_ids: set[str]):
    for message in chunk.get("messages", []):
        msg_id = getattr(message, "id", None)
        if msg_id is not None:
            if msg_id in processed_ids:
                continue
            processed_ids.add(msg_id)

        msg_type, content = classify_message(message)
        if content:
            append_event(run, msg_type, content)

        for tool_call in getattr(message, "tool_calls", []) or []:
            if isinstance(tool_call, dict):
                name = tool_call.get("name", "tool")
                args = tool_call.get("args", {})
            else:
                name = getattr(tool_call, "name", "tool")
                args = getattr(tool_call, "args", {})
            append_event(run, "Tool Call", f"{name}({args})")

    update_analyst_statuses(run, chunk, selected_analysts)

    if chunk.get("investment_debate_state"):
        run["investment_debate_state"] = chunk["investment_debate_state"]
        update_research_statuses(run, chunk["investment_debate_state"])

    if chunk.get("trader_investment_plan"):
        run["trader_investment_plan"] = chunk["trader_investment_plan"]
        run["trader_investment_decision"] = chunk["trader_investment_plan"]
        run.setdefault("report_sections", {})["trader_investment_plan"] = chunk["trader_investment_plan"]
        set_agent_status(run, "Trader", "completed")
        set_agent_status(run, "Aggressive Analyst", "running")

    if chunk.get("risk_debate_state"):
        run["risk_debate_state"] = chunk["risk_debate_state"]
        update_risk_statuses(run, chunk["risk_debate_state"])

    step = run["progress"].get("active_agent") or "streaming"
    update_progress(run, step)

# ── Mount static files ──────────────────────────────────────────────────────

if FRONTEND_BUILD.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_BUILD / "assets")), name="assets")

# ── API Endpoints ───────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.now().isoformat()}

@app.get("/api/config")
def get_config():
    """Return available analysts, models, etc."""
    # Refresh OpenRouter models every startup
    _load_openrouter_models()
    return {
        "analysts": ["market", "social", "news", "fundamentals"],
        "llm_providers": ["openai", "anthropic", "google", "openrouter"],
        "models": {
            "openai": ["gpt-5.4", "gpt-5.4-mini", "gpt-4o", "o3-mini"],
            "anthropic": ["claude-sonnet-4-6", "claude-haiku-4"],
            "google": ["gemini-2.0-flash", "gemini-2.0-pro"],
            "openrouter": _openrouter_models,
        },
        "defaults": {
            "deep_think_llm": "anthropic/claude-sonnet-4.6",
            "quick_think_llm": "openai/gpt-4o-mini",
            "llm_provider": "openrouter",
            "max_debate_rounds": 1,
        },
    }

@app.get("/api/runs")
def list_runs():
    """List all historical runs."""
    live_runs = [
        {
            "run_id": run["run_id"],
            "ticker": run["ticker"],
            "trade_date": run["trade_date"],
            "status": run.get("status"),
            "created_at": run.get("created_at"),
            "source": "memory",
        }
        for run in RUNS.values()
    ]
    historical = scan_historical_runs()
    seen = {run["run_id"] for run in live_runs}
    return live_runs + [run for run in historical if run["run_id"] not in seen]

@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    """Get detailed report for a specific run."""
    if run_id in RUNS:
        return RUNS[run_id]

    # Try JSON log first
    for r in scan_historical_runs():
        if r["run_id"] == run_id and r.get("source") == "json_log":
            with open(r["path"], "r") as f:
                data = json.load(f)
            return {"run_id": run_id, **data}
    # Try markdown reports
    for r in scan_historical_runs():
        if r["run_id"] == run_id and r.get("source") == "md_reports":
            reports = {}
            report_dir = Path(r["path"])
            for stage_dir in report_dir.iterdir():
                if stage_dir.is_dir():
                    stage_name = stage_dir.name
                    reports[stage_name] = {}
                    for md_file in stage_dir.glob("*.md"):
                        reports[stage_name][md_file.stem] = md_file.read_text()
            return {"run_id": run_id, "reports": reports}
    raise HTTPException(status_code=404, detail="Run not found")

@app.post("/api/analyze", response_model=RunResponse)
def start_analyze(payload: RunConfig, background_tasks: BackgroundTasks):
    """Start a new analysis run."""
    # Validate API key availability before queuing
    provider = payload.llm_provider
    env_key = PROVIDER_KEYS.get(provider)
    if env_key and not os.getenv(env_key):
        raise HTTPException(
            status_code=400,
            detail=f"Missing API key for provider '{provider}'. Set {env_key} in your .env file."
        )

    run_id = str(uuid.uuid4())[:8]
    run_record = {
        "run_id": run_id,
        "ticker": payload.ticker.upper(),
        "trade_date": payload.trade_date,
        "status": "queued",
        "created_at": datetime.now().isoformat(),
        "config": payload.model_dump(),
        "progress": {
            "step": "queued",
            "active_agent": None,
            "completed_agents": 0,
            "total_agents": 0,
            "reports_completed": 0,
        },
        "messages": [],
        "events": [],
        "report_sections": {},
        "agent_status": initialize_agent_status(payload.selected_analysts),
        "stats": {"llm_calls": 0, "tool_calls": 0, "tokens_in": 0, "tokens_out": 0},
    }
    update_progress(run_record, "queued")
    RUNS[run_id] = run_record
    background_tasks.add_task(execute_run, run_id, payload)
    return RunResponse(
        run_id=run_id,
        status="queued",
        ticker=payload.ticker.upper(),
        trade_date=payload.trade_date,
        created_at=run_record["created_at"],
    )

@app.get("/api/runs/{run_id}/status")
def get_status(run_id: str):
    if run_id not in RUNS:
        raise HTTPException(status_code=404, detail="Run not found")
    return RUNS[run_id]

@app.get("/api/runs/{run_id}/stream")
async def stream_status(run_id: str):
    """SSE stream for live run updates."""
    if run_id not in RUNS:
        raise HTTPException(status_code=404, detail="Run not found")

    async def event_generator():
        last_state = ""
        while True:
            state = RUNS.get(run_id)
            if state is None:
                break
            serialized = json.dumps(state, default=str)
            if serialized != last_state:
                yield f"data: {serialized}\n\n"
                last_state = serialized
            if state.get("status") in ("completed", "failed"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )

# ── Agent execution ─────────────────────────────────────────────────────────

def execute_run(run_id: str, payload: RunConfig):
    """Background worker that executes the TradingAgents graph."""
    run = RUNS[run_id]
    run["status"] = "running"
    first_analyst = payload.selected_analysts[0] if payload.selected_analysts else "market"
    set_agent_status(run, ANALYST_AGENT_NAMES.get(first_analyst, "Market Analyst"), "running")
    update_progress(run, "initializing")

    try:
        cfg = DEFAULT_CONFIG.copy()
        cfg.update({
            "llm_provider": payload.llm_provider,
            "deep_think_llm": payload.deep_think_llm,
            "quick_think_llm": payload.quick_think_llm,
            "max_debate_rounds": payload.max_debate_rounds,
            "max_risk_discuss_rounds": payload.max_debate_rounds,
        })

        stats_handler = StatsCallbackHandler()
        ta = TradingAgentsGraph(
            selected_analysts=payload.selected_analysts,
            debug=payload.debug,
            config=cfg,
            callbacks=[stats_handler],
        )

        run["messages"].append("TradingAgents graph initialized")
        append_event(run, "System", "TradingAgents graph initialized")
        update_progress(run, "initializing graph")

        ticker = payload.ticker.upper()
        ta.ticker = ticker
        ta._resolve_pending_entries(ticker)
        past_context = ta.memory_log.get_past_context(ticker)
        init_agent_state = ta.propagator.create_initial_state(
            ticker,
            payload.trade_date,
            past_context=past_context,
        )
        args = ta.propagator.get_graph_args(callbacks=[stats_handler])

        trace = []
        processed_ids: set[str] = set()
        for chunk in ta.graph.stream(init_agent_state, **args):
            trace.append(chunk)
            process_stream_chunk(run, chunk, payload.selected_analysts, processed_ids)
            run["stats"] = stats_handler.get_stats()

        if not trace:
            raise RuntimeError("TradingAgents graph finished without producing a final state.")

        final_state = trace[-1]
        ta.curr_state = final_state
        ta._log_state(payload.trade_date, final_state)
        ta.memory_log.store_decision(
            ticker=ticker,
            trade_date=payload.trade_date,
            final_trade_decision=final_state["final_trade_decision"],
        )
        signal = ta.process_signal(final_state["final_trade_decision"])

        run["status"] = "completed"
        run.update({
            "market_report": final_state.get("market_report", ""),
            "sentiment_report": final_state.get("sentiment_report", ""),
            "news_report": final_state.get("news_report", ""),
            "fundamentals_report": final_state.get("fundamentals_report", ""),
            "investment_debate_state": final_state.get("investment_debate_state", {}),
            "investment_plan": final_state.get("investment_plan", ""),
            "trader_investment_decision": final_state.get("trader_investment_decision", ""),
            "trader_investment_plan": final_state.get("trader_investment_plan", ""),
            "risk_debate_state": final_state.get("risk_debate_state", {}),
            "final_trade_decision": final_state.get("final_trade_decision", ""),
        })
        run["result"] = {
            "signal": signal,
            "final_trade_decision": final_state.get("final_trade_decision", ""),
            "investment_plan": final_state.get("investment_plan", ""),
        }
        for agent in run.get("agent_status", {}):
            set_agent_status(run, agent, "completed")
        run["stats"] = stats_handler.get_stats()
        update_progress(run, "done")
        complete_msg = f"Run complete - Signal: {signal}"
        run["messages"].append(complete_msg)
        append_event(run, "System", complete_msg)

    except Exception as e:
        run["status"] = "failed"
        run["error"] = str(e)
        for agent, status in list(run.get("agent_status", {}).items()):
            if status in ("running", "in_progress"):
                set_agent_status(run, agent, "failed")
        update_progress(run, "failed")
        run["messages"].append(f"Error: {e}")
        append_event(run, "Error", str(e))

# Catch-all for SPA
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve the React SPA for any non-API route."""
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
    index = FRONTEND_BUILD / "index.html"
    if index.exists():
        return FileResponse(str(index))
    raise HTTPException(status_code=404, detail="Frontend not built. Run npm run build in dashboard/frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)
