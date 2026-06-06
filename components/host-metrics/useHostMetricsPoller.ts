"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HostMetricsSummary } from "@/lib/host-info/summary";
import { METRICS_POLL_INTERVAL_MS } from "@/lib/host-info/types";

export function useHostMetricsPoller(connectionId: string, enabled: boolean) {
  const [summary, setSummary] = useState<HostMetricsSummary | null>(null);
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

  useEffect(() => {
    setSummary(null);
    setError("");
  }, [connectionId]);

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

  const collect = useCallback(async () => {
    if (!enabled || collectingRef.current) return;
    collectingRef.current = true;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/connections/${connectionId}/collect-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryOnly: true }),
      });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        setError(data.error || "Collection failed");
        return;
      }
      if (data.summary) setSummary(data.summary as HostMetricsSummary);
    } catch {
      if (mountedRef.current) setError("Collection failed");
    } finally {
      if (mountedRef.current) setLoading(false);
      collectingRef.current = false;
    }
  }, [connectionId, enabled]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!enabled || !visible) return;

    void collect();
    intervalRef.current = setInterval(() => {
      void collect();
    }, METRICS_POLL_INTERVAL_MS);

    return () => {
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
