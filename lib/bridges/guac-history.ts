import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/index";
import type { GuacTokenMeta } from "../guac/token";
import { registerSession, unregisterSession } from "../sessions/registry";

const activeHistories = new Map<number, string>();

interface GuacClientConnection {
  connectionId: number;
  connectionSettings?: {
    meta?: GuacTokenMeta;
  };
  close?: (error?: Error) => void;
}

export function handleGuacOpen(clientConnection: GuacClientConnection) {
  const meta = clientConnection.connectionSettings?.meta;
  if (!meta) return;

  const historyId = uuidv4();
  getDb()
    .prepare(
      `INSERT INTO connection_history
        (id, user_id, connection_id, quick_session_id, workspace_id, protocol, connection_name, hostname, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    )
    .run(
      historyId,
      meta.userId,
      meta.connectionId,
      meta.quickSessionId ?? null,
      meta.workspace_id,
      meta.protocol,
      meta.connectionName,
      meta.hostname,
    );

  activeHistories.set(clientConnection.connectionId, historyId);

  registerSession(historyId, {
    close: () => {
      clientConnection.close?.();
    },
    connectionId: meta.quickSessionId || meta.connectionId,
    userId: meta.userId,
  });
}

export function handleGuacClose(clientConnection: GuacClientConnection, error?: Error) {
  const historyId = activeHistories.get(clientConnection.connectionId);
  if (!historyId) return;

  activeHistories.delete(clientConnection.connectionId);
  unregisterSession(historyId);
  const status = error ? "error" : "completed";
  getDb()
    .prepare(
      "UPDATE connection_history SET ended_at = datetime('now'), status = ?, error_message = ? WHERE id = ?",
    )
    .run(status, error?.message || null, historyId);
}
