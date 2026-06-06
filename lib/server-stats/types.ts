export interface ServerStats {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  node_version: string;
  cpu_count: number;
  cpu_model: string | null;
  cpu_util_pct: number | null;
  load_avg: [number, number, number] | null;
  memory_total_mb: number;
  memory_used_mb: number;
  memory_util_pct: number;
  disk_total_gb: number | null;
  disk_used_gb: number | null;
  disk_util_pct: number | null;
  uptime_seconds: number;
  collected_at: string;
}
