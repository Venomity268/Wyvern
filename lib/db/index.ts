import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { runMigrations } from "./migrate";
import { createPersonalWorkspace } from "./workspaces";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || join(process.cwd(), "data", "bastion.db");
    mkdirSync(dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    const schema = readFileSync(join(process.cwd(), "lib", "db", "schema.sql"), "utf-8");
    db.exec(schema);
    runMigrations(db);
    seedAdmin(db);
  }
  return db;
}

function seedAdmin(database: Database.Database) {
  const count = database.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
  if (count.c > 0) return;

  const email = process.env.ADMIN_EMAIL || "admin@localhost";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const hash = bcrypt.hashSync(password, 12);
  const userId = uuidv4();

  database.prepare(
    "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
  ).run(userId, email, hash);

  createPersonalWorkspace(database, userId);

  console.log(`> Seeded admin user: ${email}`);
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: "user" | "admin";
  totp_secret?: string | null;
  totp_enabled?: number;
  created_at: string;
}

import type { ConnectionProtocol } from "../protocols";

export interface Connection {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  folder_id: string | null;
  tags: string | null;
  name: string;
  hostname: string;
  port: number;
  protocol: ConnectionProtocol;
  username: string | null;
  credential_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Credential {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  label: string;
  username: string | null;
  encrypted_password: string | null;
  encrypted_private_key: string | null;
  encrypted_passphrase: string | null;
  created_at: string;
  updated_at: string;
}

export interface HistoryEntry {
  id: string;
  user_id: string;
  connection_id: string | null;
  workspace_id: string | null;
  protocol: string;
  connection_name: string | null;
  hostname: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  error_message: string | null;
}

export interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  resource: string;
  metadata: string | null;
  created_at: string;
}

export function logAudit(
  userId: string,
  action: string,
  resource: string,
  metadata?: Record<string, unknown>,
) {
  getDb()
    .prepare(
      "INSERT INTO audit_log (id, user_id, action, resource, metadata) VALUES (?, ?, ?, ?, ?)",
    )
    .run(uuidv4(), userId, action, resource, metadata ? JSON.stringify(metadata) : null);
}

export { createPersonalWorkspace, getPersonalWorkspace, listWorkspacesForUser, isWorkspaceMember, getWorkspaceById } from "./workspaces";
export type { Workspace, WorkspaceMember, WorkspaceWithRole } from "./workspaces";
