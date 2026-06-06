import type { HostMetricsDetail } from "./types";

export interface HostMetricsSummary {
  memory_total_mb: number | null;
  memory_used_mb: number | null;
  memory_util_pct: number | null;
  disk_total_gb: number | null;
  disk_used_gb: number | null;
  disk_util_pct: number | null;
  uptime_seconds: number | null;
  collected_at: string;
  collection_error: string | null;
}

export function detailToSummary(detail: HostMetricsDetail): HostMetricsSummary {
  return {
    memory_total_mb: detail.memory_total_mb,
    memory_used_mb: detail.memory_used_mb,
    memory_util_pct: detail.memory_util_pct,
    disk_total_gb: detail.disk_total_gb,
    disk_used_gb: detail.disk_used_gb,
    disk_util_pct: detail.disk_util_pct,
    uptime_seconds: detail.uptime_seconds,
    collected_at: detail.collected_at,
    collection_error: detail.collection_error,
  };
}
