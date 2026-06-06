"use client";

import type { HostMetricsHistoryPoint } from "@/lib/host-info/types";
import { utilColor } from "./format";

export function UtilBar({
  label,
  value,
  caption,
}: {
  label: string;
  value: number | null | undefined;
  caption?: string;
}) {
  const pct = value ?? 0;
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-200">{value !== null && value !== undefined ? `${Math.round(clamped)}%` : "—"}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${utilColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {caption && <p className="text-[10px] text-zinc-600">{caption}</p>}
    </div>
  );
}

export function Sparkline({
  data,
  field,
  label,
  color = "#34d399",
  height = 48,
  formatValue,
}: {
  data: HostMetricsHistoryPoint[];
  field: keyof Pick<
    HostMetricsHistoryPoint,
    "cpu_util_pct" | "memory_util_pct" | "disk_util_pct" | "load_avg_1"
  >;
  label: string;
  color?: string;
  height?: number;
  formatValue?: (value: number) => string;
}) {
  if (data.length < 2) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="text-xs text-zinc-600">Collecting history…</p>
      </div>
    );
  }

  const values = data.map((d) => d[field] ?? 0);
  const max = Math.max(...values, 1);
  const width = 280;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - (v / max) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const latest = values[values.length - 1];
  const latestLabel = formatValue ? formatValue(latest) : `${Math.round(latest)}%`;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
        <span className="font-mono text-xs text-zinc-300">{latestLabel}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-full" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
      </svg>
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-zinc-100">{value}</p>
    </div>
  );
}
