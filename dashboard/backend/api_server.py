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

# In-memory run store (simple persistence; replace with Redis in prod)
RUNS: Dict[str, Dict[str, Any]] = {}

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
    return {
        "analysts": ["market", "social", "news", "fundamentals"],
        "llm_providers": ["openai", "anthropic", "google", "openrouter"],
        "models": {
            "openai": ["gpt-5.4", "gpt-5.4-mini", "gpt-4o", "o3-mini"],
            "anthropic": ["claude-sonnet-4-6", "claude-haiku-4"],
            "google": ["gemini-2.0-flash", "gemini-2.0-pro"],
            "openrouter": [
                "anthropic/claude-3.5-sonnet",
                "anthropic/claude-3-opus",
                "openai/gpt-4o",
                "openai/gpt-4o-mini",
                "openai/o1-mini",
                "deepseek/deepseek-chat",
                "google/gemini-1.5-pro",
                "meta-llama/llama-3.1-405b-instruct",
                "nvidia/llama-3.1-nemotron-70b-instruct",
                "mistralai/mistral-large",
            ],
        },
        "defaults": {
            "deep_think_llm": "gpt-5.4-mini",
            "quick_think_llm": "gpt-5.4-mini",
            "llm_provider": "openrouter",
            "max_debate_rounds": 1,
        },
    }

@app.get("/api/runs")
def list_runs():
    """List all historical runs."""
    return scan_historical_runs()

@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    """Get detailed report for a specific run."""
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
    key_map = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "google": "GOOGLE_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
        "qwen": "DASHSCOPE_API_KEY",
        "glm": "ZHIPU_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "xai": "XAI_API_KEY",
    }
    env_key = key_map.get(provider)
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
        "progress": {},
        "messages": [],
    }
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
        last_state = None
        while True:
            state = RUNS.get(run_id)
            if state is None:
                break
            if state != last_state:
                yield f"data: {json.dumps(state)}\n\n"
                last_state = state.copy()
            if state.get("status") in ("completed", "failed"):
                yield f"data: {json.dumps({'status': 'done'})}\n\n"
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

    try:
        cfg = DEFAULT_CONFIG.copy()
        cfg.update({
            "llm_provider": payload.llm_provider,
            "deep_think_llm": payload.deep_think_llm,
            "quick_think_llm": payload.quick_think_llm,
            "max_debate_rounds": payload.max_debate_rounds,
        })

        ta = TradingAgentsGraph(
            selected_analysts=payload.selected_analysts,
            debug=payload.debug,
            config=cfg,
        )

        run["progress"]["step"] = "initializing"
        run["messages"].append("TradingAgents graph initialized")

        final_state, signal = ta.propagate(payload.ticker.upper(), payload.trade_date)

        run["status"] = "completed"
        run["progress"]["step"] = "done"
        run["result"] = {
            "signal": signal,
            "final_trade_decision": final_state.get("final_trade_decision", ""),
            "investment_plan": final_state.get("investment_plan", ""),
        }
        run["messages"].append(f"Run complete — Signal: {signal}")

    except Exception as e:
        run["status"] = "failed"
        run["error"] = str(e)
        run["messages"].append(f"Error: {e}")

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
