import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  is_personal: number;
  created_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
}

export interface WorkspaceWithRole extends Workspace {
  member_role: "owner" | "member";
}

export function createPersonalWorkspace(
  db: Database.Database,
  userId: string,
  name = "Personal",
): Workspace {
  const existing = db
    .prepare("SELECT * FROM workspaces WHERE owner_id = ? AND is_personal = 1")
    .get(userId) as Workspace | undefined;
  if (existing) return existing;

  const id = uuidv4();
  db.prepare(
    "INSERT INTO workspaces (id, name, owner_id, is_personal) VALUES (?, ?, ?, 1)",
  ).run(id, name, userId);
  db.prepare(
    "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')",
  ).run(id, userId);

  return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as Workspace;
}

export function getPersonalWorkspace(
  db: Database.Database,
  userId: string,
): Workspace | undefined {
  return db
    .prepare("SELECT * FROM workspaces WHERE owner_id = ? AND is_personal = 1")
    .get(userId) as Workspace | undefined;
}

export function listWorkspacesForUser(
  db: Database.Database,
  userId: string,
): WorkspaceWithRole[] {
  return db
    .prepare(
      `SELECT w.*, wm.role AS member_role
       FROM workspaces w
       INNER JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = ?
       ORDER BY w.is_personal DESC, w.name ASC`,
    )
    .all(userId) as WorkspaceWithRole[];
}

export function isWorkspaceMember(
  db: Database.Database,
  userId: string,
  workspaceId: string,
): WorkspaceMember | undefined {
  return db
    .prepare(
      "SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    )
    .get(workspaceId, userId) as WorkspaceMember | undefined;
}

export function getWorkspaceById(
  db: Database.Database,
  workspaceId: string,
): Workspace | undefined {
  return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId) as
    | Workspace
    | undefined;
}
