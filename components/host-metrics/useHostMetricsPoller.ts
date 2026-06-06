"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HostMetricsSummary } from "@/lib/host-info/summary";
import { METRICS_POLL_INTERVAL_MS } from "@/lib/host-info/types";

export function useHostMetricsPoller(
  connectionId: string,
  enabled: boolean,
  initialSummary?: HostMetricsSummary | null,
) {
  const [summary, setSummary] = useState<HostMetricsSummary | null>(initialSummary || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const collectingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [prevKey, setPrevKey] = useState({ connectionId, initialSummary });
  if (connectionId !== prevKey.connectionId || initialSummary !== prevKey.initialSummary) {
    setPrevKey({ connectionId, initialSummary });
    setSummary(initialSummary || null);
    setError("");
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, connectionId]);

  const collect = useCallback(async (force = false) => {
    if (!enabled || collectingRef.current) return;
    collectingRef.current = true;
    setLoading(true);
    setError("");

    try {
      // 1. Fetch cached metrics from DB first if we don't have it in state
      let currentSummary = summary;
      if (!currentSummary) {
        const getRes = await fetch(`/api/connections/${connectionId}/collect-info`);
        if (getRes.ok) {
          const getData = await getRes.json();
          if (getData.summary) {
            currentSummary = getData.summary as HostMetricsSummary;
            if (mountedRef.current) {
              setSummary(currentSummary);
            }
          }
        }
      }

      // 2. Decide if we need to do the expensive POST call (SSH connection)
      let shouldCollect = force || !currentSummary;
      if (currentSummary && !shouldCollect) {
        const collectedAtStr = currentSummary.collected_at;
        if (collectedAtStr) {
          try {
            const collectedAt = new Date(collectedAtStr).getTime();
            const now = Date.now();
            // Consider stale if older than 5 minutes (300,000 ms)
            if (now - collectedAt > 5 * 60 * 1000) {
              shouldCollect = true;
            }
          } catch {
            shouldCollect = true;
          }
        } else {
          shouldCollect = true;
        }
      }

      if (shouldCollect) {
        const res = await fetch(`/api/connections/${connectionId}/collect-info`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summaryOnly: true }),
        });
        const data = await res.json();
        if (!mountedRef.current) return;
        if (!res.ok) {
          if (!currentSummary) {
            setError(data.error || "Collection failed");
          }
          return;
        }
        if (data.summary) setSummary(data.summary as HostMetricsSummary);
      }
    } catch {
      if (mountedRef.current && !summary) setError("Collection failed");
    } finally {
      if (mountedRef.current) setLoading(false);
      collectingRef.current = false;
    }
  }, [connectionId, enabled, summary]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!enabled || !visible) return;

    const timeout = setTimeout(() => {
      void collect();
    }, 0);
    intervalRef.current = setInterval(() => {
      void collect();
    }, METRICS_POLL_INTERVAL_MS);

    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, visible, connectionId, collect]);

  return {
    summary,
    loading,
    error,
    collect,
    containerRef,
  };
}
