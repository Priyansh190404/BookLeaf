"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * Near-real-time updates via polling. Chosen over WebSockets/SSE because it works unchanged on
 * serverless hosts and behind any proxy; at this scale (few seconds of latency) it's the simplest thing
 * that feels live. Pauses while the tab is hidden and refetches on focus.
 * State only updates when the payload actually changed, so idle polls cause no re-render.
 *
 * `key` identifies what is being fetched (changing it resets state); `fetcher` does the fetching.
 */
export function usePollingFn<T>(key: string | null, fetcher: () => Promise<T>, intervalMs = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const last = useRef("");
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const refresh = useCallback(async () => {
    if (!key) return;
    try {
      const next = await fetchRef.current();
      const serialized = JSON.stringify(next);
      if (serialized !== last.current) { last.current = serialized; setData(next); }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    last.current = "";
    setLoading(true);
    refresh();
    const tick = () => { if (!document.hidden) refresh(); };
    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [refresh, intervalMs]);

  return { data, error, loading, refresh };
}

export const usePolling = <T,>(url: string | null, intervalMs = 5000) =>
  usePollingFn<T>(url, () => api<T>(url!), intervalMs);
