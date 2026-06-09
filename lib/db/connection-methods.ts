import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type { ConnectionProtocol } from "../protocols";
import { defaultPort } from "../protocols";
import { getDb } from "./index";

export interface ConnectionMethodRow {
  id: string;
  connection_id: string;
  protocol: ConnectionProtocol;
  port: number;
  credential_id: string | null;
}

export interface ConnectionMethodInput {
  protocol: ConnectionProtocol;
  port: number;
  credential_id?: string | null;
}

export function getMethodsForConnection(
  db: Database.Database,
  connectionId: string,
): ConnectionMethodRow[] {
  return db
    .prepare(
      `SELECT id, connection_id, protocol, port, credential_id
       FROM connection_methods WHERE connection_id = ? ORDER BY protocol ASC`,
    )
    .all(connectionId) as ConnectionMethodRow[];
}

export function getMethodPort(
  db: Database.Database,
  connectionId: string,
  protocol: ConnectionProtocol,
): number | null {
  const row = db
    .prepare("SELECT port FROM connection_methods WHERE connection_id = ? AND protocol = ?")
    .get(connectionId, protocol) as { port: number } | undefined;
  return row?.port ?? null;
}

export function getMethodCredential(
  db: Database.Database,
  connectionId: string,
  protocol: ConnectionProtocol,
): string | null {
  const row = db
    .prepare(
      "SELECT credential_id FROM connection_methods WHERE connection_id = ? AND protocol = ?",
    )
    .get(connectionId, protocol) as { credential_id: string | null } | undefined;
  return row?.credential_id ?? null;
}

export function resolveTerminalMethodCredential(
  db: Database.Database,
  connectionId: string,
  protocol: "ssh" | "telnet",
  legacyCredentialId: string | null,
): string | null {
  if (connectionHasMethod(db, connectionId, protocol)) {
    return getMethodCredential(db, connectionId, protocol);
  }
  return legacyCredentialId;
}

export function resolveGuacMethodCredential(
  db: Database.Database,
  connectionId: string,
  protocol: "vnc" | "rdp",
  legacyCredentialId: string | null,
): string | null {
  if (connectionHasMethod(db, connectionId, protocol)) {
    return getMethodCredential(db, connectionId, protocol);
  }
  return legacyCredentialId;
}

export function connectionHasMethod(
  db: Database.Database,
  connectionId: string,
  protocol: ConnectionProtocol,
): boolean {
  return getMethodPort(db, connectionId, protocol) !== null;
}

export function saveMethodsForConnection(
  db: Database.Database,
  connectionId: string,
  methods: ConnectionMethodInput[],
) {
  db.prepare("DELETE FROM connection_methods WHERE connection_id = ?").run(connectionId);
  const insert = db.prepare(
    "INSERT INTO connection_methods (id, connection_id, protocol, port, credential_id) VALUES (?, ?, ?, ?, ?)",
  );
  for (const m of methods) {
    insert.run(uuidv4(), connectionId, m.protocol, m.port, m.credential_id ?? null);
  }
}

export function attachMethods<T extends { id: string; credential_id?: string | null }>(
  connections: T[],
): (T & { methods: ConnectionMethodInput[] })[] {
  const db = getDb();
  return connections.map((c) => ({
    ...c,
    methods: getMethodsForConnection(db, c.id).map((m) => ({
      protocol: m.protocol,
      port: m.port,
      credential_id: m.credential_id,
    })),
  }));
}

export function primaryMethod(
  methods: ConnectionMethodInput[],
): ConnectionMethodInput | undefined {
  return methods[0];
}

/** Legacy connections.credential_id FK references credentials; bastion key lives on methods only. */
export function toLegacyCredentialId(credentialId: string | null | undefined): string | null {
  if (!credentialId || credentialId === "__bastion__") return null;
  return credentialId;
}

export function legacyConnectionCredentialId(
  methods: ConnectionMethodInput[],
): string | null {
  return toLegacyCredentialId(primaryMethod(methods)?.credential_id ?? null);
}

export function normalizeMethods(
  methods: ConnectionMethodInput[] | undefined,
  fallback?: { protocol: ConnectionProtocol; port: number; credential_id?: string | null },
): ConnectionMethodInput[] {
  if (methods?.length) {
    const seen = new Set<ConnectionProtocol>();
    const out: ConnectionMethodInput[] = [];
    for (const m of methods) {
      if (seen.has(m.protocol)) continue;
      seen.add(m.protocol);
      out.push({
        protocol: m.protocol,
        port: m.port || defaultPort(m.protocol),
        credential_id: m.credential_id ?? null,
      });
    }
    return out.sort((a, b) => a.protocol.localeCompare(b.protocol));
  }
  if (fallback) {
    return [
      {
        protocol: fallback.protocol,
        port: fallback.port,
        credential_id: fallback.credential_id ?? null,
      },
    ];
  }
  return [];
}

export function resolveMethodCredentials(
  methods: ConnectionMethodInput[],
  workspaceId: string,
  credentialInWorkspace: (credentialId: string, workspaceId: string) => boolean,
): ConnectionMethodInput[] {
  return methods.map((m) => ({
    ...m,
    credential_id:
      m.credential_id && credentialInWorkspace(m.credential_id, workspaceId)
        ? m.credential_id
        : null,
  }));
}
