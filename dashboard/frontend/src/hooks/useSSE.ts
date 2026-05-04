import { useState, useEffect } from "react";

export function useSSE<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url);
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try { setData(JSON.parse(e.data)); } catch {}
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [url]);

  return { data, connected };
}
