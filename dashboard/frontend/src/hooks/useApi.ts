import { useState, useEffect } from "react";
import { Run } from "../types";

const API_BASE = "/api";

async function fetchJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function useRuns() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson(`${API_BASE}/runs`)
      .then(setRuns)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { runs, loading, error, refresh: () => window.location.reload() };
}

export async function getRun(runId: string) {
  return fetchJson(`${API_BASE}/runs/${runId}`);
}

export async function getConfig() {
  return fetchJson(`${API_BASE}/config`);
}

export async function startAnalysis(body: any) {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return { status: "error", message: json.detail || text };
    } catch {
      return { status: "error", message: text };
    }
  }
  return res.json();
}

export function useRunStatus(runId: string, poll = false) {
  const [status, setStatus] = useState<any>(null);
  useEffect(() => {
    if (!runId || !poll) return;
    const id = setInterval(() => {
      fetchJson(`${API_BASE}/runs/${runId}/status`).then(setStatus).catch(console.error);
    }, 1500);
    return () => clearInterval(id);
  }, [runId, poll]);
  return status;
}
