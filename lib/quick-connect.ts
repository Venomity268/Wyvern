import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type { SessionUser } from "./auth/session-options";
import { getDb } from "./db/index";
import { encryptSecret, decryptSecret } from "./crypto/secrets";
import type { ConnectionProtocol } from "./protocols";
import { defaultPort } from "./protocols";
import type { ResolvedSshConnection, SshAuthParams } from "./bridges/ssh-connect";
import { normalizeConnectionTarget } from "./connection-target";

const QUICK_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface QuickSessionRow {
  id: string;
  user_id: string;
  label: string;
  hostname: string;
  port: number;
  protocol: ConnectionProtocol;
  username: string | null;
  encrypted_password: string | null;
  encrypted_private_key: string | null;
  mac_address: string | null;
  created_at: string;
  expires_at: string;
}

export interface QuickConnectInput {
  protocol: ConnectionProtocol;
  hostname: string;
  port?: number;
  label?: string;
  username?: string;
  password?: string;
  privateKey?: string;
  macAddress?: string;
}

export function createQuickSession(
  db: Database.Database,
  userId: string,
  input: QuickConnectInput,
): QuickSessionRow {
  const id = uuidv4();
  const now = Date.now();
  const expiresAt = new Date(now + QUICK_SESSION_TTL_MS).toISOString();
  const normalized = normalizeConnectionTarget(input.hostname, input.port ?? defaultPort(input.protocol));
  const port = normalized.port ?? input.port ?? defaultPort(input.protocol);
  const label = input.label?.trim() || normalized.hostname;

  db.prepare(
    `INSERT INTO quick_sessions
      (id, user_id, label, hostname, port, protocol, username, encrypted_password, encrypted_private_key, mac_address, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    label,
    normalized.hostname,
    port,
    input.protocol,
    input.username?.trim() || null,
    input.password ? encryptSecret(input.password) : null,
    input.privateKey ? encryptSecret(input.privateKey) : null,
    input.macAddress?.trim() || null,
    expiresAt,
  );

  return getQuickSession(db, userId, id)!;
}

export function getQuickSession(
  db: Database.Database,
  userId: string,
  id: string,
): QuickSessionRow | null {
  purgeExpiredQuickSessions(db);

  const row = db
    .prepare("SELECT * FROM quick_sessions WHERE id = ? AND user_id = ?")
    .get(id, userId) as QuickSessionRow | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM quick_sessions WHERE id = ?").run(id);
    return null;
  }
  return row;
}

export function deleteQuickSession(db: Database.Database, userId: string, id: string) {
  db.prepare("DELETE FROM quick_sessions WHERE id = ? AND user_id = ?").run(id, userId);
}

function purgeExpiredQuickSessions(db: Database.Database) {
  db.prepare("DELETE FROM quick_sessions WHERE expires_at <= datetime('now')").run();
}

export function resolveQuickSsh(
  user: SessionUser,
  quickSessionId: string,
  auth?: SshAuthParams,
  db?: Database.Database,
): ResolvedSshConnection | { error: string; needsAuth?: boolean } {
  const database = db ?? getDb();
  const session = getQuickSession(database, user.id, quickSessionId);

  if (!session) {
    return { error: "Quick session not found or expired" };
  }

  if (session.protocol !== "ssh") {
    return { error: "Quick session is not an SSH target" };
  }

  let password = auth?.password;
  let privateKey = auth?.privateKey;

  if (session.encrypted_password && !password) {
    password = decryptSecret(session.encrypted_password);
  }
  if (session.encrypted_private_key && !privateKey) {
    privateKey = decryptSecret(session.encrypted_private_key);
  }

  const username = auth?.username || session.username || undefined;

  if (!username) {
    return { error: "Username required", needsAuth: true };
  }

  if (!password && !privateKey) {
    return { error: "Credentials required", needsAuth: true };
  }

  return {
    connection: {
      id: session.id,
      workspace_id: "",
      owner_id: user.id,
      name: session.label,
      hostname: session.hostname,
      port: session.port,
      protocol: "ssh",
      username: session.username,
      credential_id: null,
    },
    username,
    password,
    privateKey,
  };
}

export interface QuickGuacAuth {
  hostname: string;
  port: number;
  protocol: "vnc" | "rdp";
  username?: string;
  password?: string;
  label: string;
  quickSessionId: string;
}

export function resolveQuickGuac(
  user: SessionUser,
  quickSessionId: string,
  inline?: { username?: string; password?: string },
  db?: Database.Database,
): QuickGuacAuth | { error: string; needsAuth?: boolean } {
  const database = db ?? getDb();
  const session = getQuickSession(database, user.id, quickSessionId);

  if (!session) {
    return { error: "Quick session not found or expired" };
  }

  if (session.protocol !== "vnc" && session.protocol !== "rdp") {
    return { error: "Quick session is not a desktop target" };
  }

  let password = inline?.password;
  if (session.encrypted_password && !password) {
    password = decryptSecret(session.encrypted_password);
  }

  const username = inline?.username || session.username || undefined;

  if (session.protocol === "rdp" && !username) {
    return { error: "RDP username required", needsAuth: true };
  }

  if (!password) {
    return { error: "Password required", needsAuth: true };
  }

  const target = normalizeConnectionTarget(session.hostname, session.port);

  return {
    quickSessionId: session.id,
    label: session.label,
    hostname: target.hostname,
    port: target.port ?? session.port,
    protocol: session.protocol,
    username,
    password,
  };
}
