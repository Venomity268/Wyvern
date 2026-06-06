import type Database from "better-sqlite3";
import type { HostMetricsDetail, HostMetricsHistoryPoint, HostMetricsSnapshot } from "../host-info/types";
import { METRICS_HISTORY_LIMIT } from "../host-info/types";
import type { HostMetricsSummary } from "../host-info/summary";

export interface ConnectionHostInfoRow {
  connection_id: string;
  fqdn: string | null;
  os_name: string | null;
  os_version: string | null;
  kernel: string | null;
  cpu_model: string | null;
  memory_total_mb: number | null;
  memory_used_mb: number | null;
  memory_util_pct: number | null;
  disk_root_gb: number | null;
  disk_used_gb: number | null;
  disk_util_pct: number | null;
  cpu_util_pct: number | null;
  uptime_seconds: number | null;
  collected_at: string;
  collection_error: string | null;
  metrics_json: string | null;
  metrics_history_json: string | null;
  raw_json: string | null;
}

function parseHistory(json: string | null): HostMetricsHistoryPoint[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as HostMetricsHistoryPoint[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendHistory(
  existing: HostMetricsHistoryPoint[],
  snapshot: HostMetricsSnapshot,
): HostMetricsHistoryPoint[] {
  if (snapshot.collection_error) return existing;

  const point: HostMetricsHistoryPoint = {
    t: snapshot.collected_at,
    cpu_util_pct: snapshot.cpu_util_pct ?? 0,
    memory_util_pct: snapshot.memory_util_pct ?? 0,
    disk_util_pct: snapshot.disk_util_pct ?? 0,
    load_avg_1: snapshot.load_avg?.[0] ?? 0,
  };

  const next = [...existing, point];
  if (next.length > METRICS_HISTORY_LIMIT) {
    return next.slice(next.length - METRICS_HISTORY_LIMIT);
  }
  return next;
}

function snapshotToMetricsJson(snapshot: HostMetricsSnapshot, history: HostMetricsHistoryPoint[]) {
  const detail: HostMetricsDetail = {
    cpu_util_pct: snapshot.cpu_util_pct,
    cpu_count: snapshot.cpu_count,
    load_avg: snapshot.load_avg,
    memory_total_mb: snapshot.memory_total_mb,
    memory_used_mb: snapshot.memory_used_mb,
    memory_available_mb: snapshot.memory_available_mb,
    memory_util_pct: snapshot.memory_util_pct,
    disk_total_gb: snapshot.disk_total_gb,
    disk_used_gb: snapshot.disk_used_gb,
    disk_available_gb: snapshot.disk_available_gb,
    disk_util_pct: snapshot.disk_util_pct,
    uptime_seconds: snapshot.uptime_seconds,
    network_rx_mb: snapshot.network_rx_mb,
    network_tx_mb: snapshot.network_tx_mb,
    fqdn: snapshot.fqdn,
    os_name: snapshot.os_name,
    os_version: snapshot.os_version,
    kernel: snapshot.kernel,
    cpu_model: snapshot.cpu_model,
    processes: snapshot.processes,
    user_services: snapshot.user_services,
    listening_ports: snapshot.listening_ports,
    history,
    collected_at: snapshot.collected_at,
    collection_error: snapshot.collection_error,
  };
  return JSON.stringify(detail);
}

export function upsertConnectionHostInfo(
  db: Database.Database,
  connectionId: string,
  snapshot: HostMetricsSnapshot,
) {
  const existing = getConnectionHostInfo(db, connectionId);
  const history = appendHistory(parseHistory(existing?.metrics_history_json ?? null), snapshot);

  db.prepare(
    `INSERT INTO connection_host_info
      (connection_id, fqdn, os_name, os_version, kernel, cpu_model,
       memory_total_mb, memory_used_mb, memory_util_pct,
       disk_root_gb, disk_used_gb, disk_util_pct,
       cpu_util_pct, uptime_seconds,
       collected_at, collection_error, metrics_json, metrics_history_json, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(connection_id) DO UPDATE SET
       fqdn = excluded.fqdn,
       os_name = excluded.os_name,
       os_version = excluded.os_version,
       kernel = excluded.kernel,
       cpu_model = excluded.cpu_model,
       memory_total_mb = excluded.memory_total_mb,
       memory_used_mb = excluded.memory_used_mb,
       memory_util_pct = excluded.memory_util_pct,
       disk_root_gb = excluded.disk_root_gb,
       disk_used_gb = excluded.disk_used_gb,
       disk_util_pct = excluded.disk_util_pct,
       cpu_util_pct = excluded.cpu_util_pct,
       uptime_seconds = excluded.uptime_seconds,
       collected_at = excluded.collected_at,
       collection_error = excluded.collection_error,
       metrics_json = excluded.metrics_json,
       metrics_history_json = excluded.metrics_history_json,
       raw_json = excluded.raw_json`,
  ).run(
    connectionId,
    snapshot.fqdn,
    snapshot.os_name,
    snapshot.os_version,
    snapshot.kernel,
    snapshot.cpu_model,
    snapshot.memory_total_mb,
    snapshot.memory_used_mb,
    snapshot.memory_util_pct,
    snapshot.disk_total_gb,
    snapshot.disk_used_gb,
    snapshot.disk_util_pct,
    snapshot.cpu_util_pct,
    snapshot.uptime_seconds,
    snapshot.collected_at,
    snapshot.collection_error,
    snapshotToMetricsJson(snapshot, history),
    JSON.stringify(history),
    Object.keys(snapshot.raw).length ? JSON.stringify(snapshot.raw) : null,
  );
}

export function getConnectionHostInfo(
  db: Database.Database,
  connectionId: string,
): ConnectionHostInfoRow | null {
  return (
    (db
      .prepare("SELECT * FROM connection_host_info WHERE connection_id = ?")
      .get(connectionId) as ConnectionHostInfoRow | undefined) ?? null
  );
}

export function rowToHostMetrics(row: ConnectionHostInfoRow | null): HostMetricsDetail | null {
  if (!row) return null;
  if (row.metrics_json) {
    try {
      return JSON.parse(row.metrics_json) as HostMetricsDetail;
    } catch {
      /* fall through */
    }
  }

  return {
    cpu_util_pct: row.cpu_util_pct,
    cpu_count: null,
    load_avg: null,
    memory_total_mb: row.memory_total_mb,
    memory_used_mb: row.memory_used_mb,
    memory_available_mb: null,
    memory_util_pct: row.memory_util_pct,
    disk_total_gb: row.disk_root_gb,
    disk_used_gb: row.disk_used_gb,
    disk_available_gb: null,
    disk_util_pct: row.disk_util_pct,
    uptime_seconds: row.uptime_seconds,
    network_rx_mb: null,
    network_tx_mb: null,
    fqdn: row.fqdn,
    os_name: row.os_name,
    os_version: row.os_version,
    kernel: row.kernel,
    cpu_model: row.cpu_model,
    processes: [],
    user_services: [],
    listening_ports: [],
    history: parseHistory(row.metrics_history_json),
    collected_at: row.collected_at,
    collection_error: row.collection_error,
  };
}

export function rowToHostMetricsSummary(row: ConnectionHostInfoRow | null): HostMetricsSummary | null {
  if (!row) return null;
  return {
    memory_total_mb: row.memory_total_mb,
    memory_used_mb: row.memory_used_mb,
    memory_util_pct: row.memory_util_pct,
    disk_total_gb: row.disk_root_gb,
    disk_used_gb: row.disk_used_gb,
    disk_util_pct: row.disk_util_pct,
    uptime_seconds: row.uptime_seconds,
    collected_at: row.collected_at,
    collection_error: row.collection_error,
  };
}

export function attachHostInfoSummary<T extends { id: string }>(
  db: Database.Database,
  connections: T[],
): (T & { host_info: HostMetricsSummary | null })[] {
  if (connections.length === 0) return [];

  const byId = new Map<string, HostMetricsSummary>();
  const rows = db
    .prepare(
      `SELECT * FROM connection_host_info WHERE connection_id IN (${connections.map(() => "?").join(",")})`,
    )
    .all(...connections.map((c) => c.id)) as ConnectionHostInfoRow[];

  for (const row of rows) {
    const summary = rowToHostMetricsSummary(row);
    if (summary) byId.set(row.connection_id, summary);
  }

  return connections.map((conn) => ({
    ...conn,
    host_info: byId.get(conn.id) ?? null,
  }));
}

/** @deprecated Use attachHostInfoSummary for list views; full detail via collect-info API. */
export function attachHostInfo<T extends { id: string }>(
  db: Database.Database,
  connections: T[],
): (T & { host_info: HostMetricsDetail | null })[] {
  if (connections.length === 0) return [];

  const byId = new Map<string, HostMetricsDetail>();
  const rows = db
    .prepare(
      `SELECT * FROM connection_host_info WHERE connection_id IN (${connections.map(() => "?").join(",")})`,
    )
    .all(...connections.map((c) => c.id)) as ConnectionHostInfoRow[];

  for (const row of rows) {
    const metrics = rowToHostMetrics(row);
    if (metrics) byId.set(row.connection_id, metrics);
  }

  return connections.map((conn) => ({
    ...conn,
    host_info: byId.get(conn.id) ?? null,
  }));
}
