import { getDb } from "@/lib/db/index";
import { getLiveSessionIds, isLiveSession } from "./registry";

export interface HistoryRow {
  id: string;
  user_id: string;
  connection_id: string | null;
  connection_name: string | null;
  hostname: string | null;
  protocol: string;
  workspace_id: string | null;
  workspace_name?: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
}

/** Mark DB rows as completed when no live WebSocket is registered for them. */
export function reconcileStaleSessions(userId: string) {
  const db = getDb();
  const liveIds = new Set(getLiveSessionIds());
  const active = db
    .prepare("SELECT id FROM connection_history WHERE user_id = ? AND status = 'active'")
    .all(userId) as { id: string }[];

  const markCompleted = db.prepare(
    `UPDATE connection_history
     SET ended_at = datetime('now'), status = 'completed', error_message = 'Session no longer active'
     WHERE id = ? AND status = 'active'`,
  );

  for (const row of active) {
    if (!liveIds.has(row.id)) {
      markCompleted.run(row.id);
    }
  }
}

/** One visible active session per connection; close duplicate DB rows. */
export function listActiveSessions(userId: string): (HistoryRow & { is_live: boolean })[] {
  reconcileStaleSessions(userId);

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT h.*, w.name AS workspace_name
       FROM connection_history h
       LEFT JOIN workspaces w ON w.id = h.workspace_id
       WHERE h.user_id = ? AND h.status = 'active'
       ORDER BY h.started_at DESC`,
    )
    .all(userId) as HistoryRow[];

  const byConnection = new Map<string, HistoryRow>();
  const markDuplicate = db.prepare(
    `UPDATE connection_history
     SET ended_at = datetime('now'), status = 'completed', error_message = 'Duplicate session entry'
     WHERE id = ? AND status = 'active'`,
  );

  for (const row of rows) {
    const key = row.connection_id ?? row.id;
    const existing = byConnection.get(key);
    if (!existing) {
      byConnection.set(key, row);
      continue;
    }

    const existingLive = isLiveSession(existing.id);
    const rowLive = isLiveSession(row.id);
    let keep: HistoryRow;
    let drop: HistoryRow;

    if (rowLive && !existingLive) {
      keep = row;
      drop = existing;
    } else if (existingLive && !rowLive) {
      keep = existing;
      drop = row;
    } else if (row.started_at > existing.started_at) {
      keep = row;
      drop = existing;
    } else {
      keep = existing;
      drop = row;
    }

    markDuplicate.run(drop.id);
    byConnection.set(key, keep);
  }

  return [...byConnection.values()]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .map((row) => ({ ...row, is_live: isLiveSession(row.id) }));
}
