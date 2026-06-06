"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import type { HostMetricsDetail } from "@/lib/host-info/types";
import type { HostMetricsSummary } from "@/lib/host-info/summary";
import { HostMetricsDetailPanel } from "./HostMetricsDetailPanel";
import { useHostMetricsPoller } from "./useHostMetricsPoller";
import { formatRam, formatStorage, formatUptime, utilColor } from "./format";

interface HostMetricsCardSummaryProps {
  connectionId: string;
  connectionName: string;
  hasSsh: boolean;
  initialSummary?: HostMetricsSummary | null;
}

function SummaryBar({ label, value, text }: { label: string; value: number | null | undefined; text: string }) {
  const pct = value ?? 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
        <span className="truncate font-mono text-[10px] text-zinc-400">{text}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${utilColor(pct)}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

export function HostMetricsCardSummary({
  connectionId,
  connectionName,
  hasSsh,
  initialSummary,
}: HostMetricsCardSummaryProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<HostMetricsDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const { summary, loading, error, containerRef } = useHostMetricsPoller(connectionId, hasSsh, initialSummary);

  const loadDetail = useCallback(async () => {
    setDetailLoading(true);
    setDetailError("");
    try {
      const res = await fetch(`/api/connections/${connectionId}/collect-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryOnly: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDetailError(data.error || "Failed to load metrics");
        return;
      }
      if (data.detail) setDetail(data.detail as HostMetricsDetail);
    } catch {
      setDetailError("Failed to load metrics");
    } finally {
      setDetailLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    if (!detailOpen) return;
    const timeout = setTimeout(() => {
      void loadDetail();
    }, 0);
    const interval = setInterval(() => void loadDetail(), 30_000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [detailOpen, loadDetail]);

  if (!hasSsh) return null;

  const hasData = summary && !summary.collection_error;

  return (
    <>
      <div ref={containerRef} className="border-t border-border px-4 py-3">
        <button
          type="button"
          className="group flex w-full items-start gap-2 text-left"
          onClick={() => setDetailOpen(true)}
        >
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">System info</p>
              <div className="flex items-center gap-1 text-[10px] text-zinc-600">
                {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>Live · 30s</span>
                <ChevronRight className="h-3 w-3 text-zinc-500 transition group-hover:translate-x-0.5" />
              </div>
            </div>

            {hasData ?
              <div className="space-y-2">
                <div className="flex gap-3">
                  <SummaryBar
                    label="RAM"
                    value={summary.memory_util_pct}
                    text={formatRam(summary.memory_used_mb, summary.memory_total_mb)}
                  />
                  <SummaryBar
                    label="Storage"
                    value={summary.disk_util_pct}
                    text={formatStorage(summary.disk_used_gb, summary.disk_total_gb)}
                  />
                </div>
                <p className="text-xs text-zinc-400">
                  Uptime{" "}
                  <span className="font-mono text-zinc-300">{formatUptime(summary.uptime_seconds)}</span>
                </p>
              </div>
            : <p className="text-xs text-zinc-500">
                {loading ? "Collecting metrics…" : "Tap to view system metrics"}
              </p>
            }

            {error && <p className="text-[10px] text-red-400">{error}</p>}
            {summary?.collection_error && (
              <p className="text-[10px] text-amber-400">{summary.collection_error}</p>
            )}
          </div>
        </button>
      </div>

      {detailOpen && (
        <HostMetricsDetailPanel
          connectionName={connectionName}
          metrics={detail}
          loading={detailLoading || loading}
          error={detailError || error}
          onClose={() => setDetailOpen(false)}
          onRefresh={() => void loadDetail()}
        />
      )}
    </>
  );
}
