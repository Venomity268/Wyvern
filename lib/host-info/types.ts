export interface HostProcessInfo {
  pid: number;
  user: string;
  cpu_pct: number;
  mem_pct: number;
  command: string;
}

export interface HostServiceInfo {
  name: string;
  state: string;
  description: string;
}

export interface HostPortInfo {
  protocol: string;
  address: string;
  port: number;
  process: string;
}

export interface HostMetricsHistoryPoint {
  t: string;
  cpu_util_pct: number;
  memory_util_pct: number;
  disk_util_pct: number;
  load_avg_1: number;
}

export interface HostMetricsDetail {
  cpu_util_pct: number | null;
  cpu_count: number | null;
  load_avg: [number, number, number] | null;
  memory_total_mb: number | null;
  memory_used_mb: number | null;
  memory_available_mb: number | null;
  memory_util_pct: number | null;
  disk_total_gb: number | null;
  disk_used_gb: number | null;
  disk_available_gb: number | null;
  disk_util_pct: number | null;
  uptime_seconds: number | null;
  network_rx_mb: number | null;
  network_tx_mb: number | null;
  fqdn: string | null;
  os_name: string | null;
  os_version: string | null;
  kernel: string | null;
  cpu_model: string | null;
  processes: HostProcessInfo[];
  user_services: HostServiceInfo[];
  listening_ports: HostPortInfo[];
  history: HostMetricsHistoryPoint[];
  collected_at: string;
  collection_error: string | null;
}

export interface HostMetricsSnapshot extends HostMetricsDetail {
  raw: Record<string, string>;
}

export const METRICS_HISTORY_LIMIT = 120;
export const METRICS_POLL_INTERVAL_MS = 30_000;
