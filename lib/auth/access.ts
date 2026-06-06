import { SessionUser } from "./session-options";
import type { ConnectionProtocol } from "../protocols";
import { getDb, isWorkspaceMember, getWorkspaceById } from "../db/index";

export interface ConnectionRow {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  folder_id?: string | null;
  tags?: string | null;
  name: string;
  hostname: string;
  port: number;
  protocol: ConnectionProtocol;
  username: string | null;
  credential_id: string | null;
}

export interface CredentialRow {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  label: string;
  username: string | null;
}

function isGlobalAdmin(user: SessionUser): boolean {
  return user.role === "admin";
}

export function canViewWorkspace(user: SessionUser, workspaceId: string): boolean {
  if (isGlobalAdmin(user)) return true;
  return !!isWorkspaceMember(getDb(), user.id, workspaceId);
}

export function canEditWorkspace(user: SessionUser, workspaceId: string): boolean {
  if (isGlobalAdmin(user)) return true;
  const member = isWorkspaceMember(getDb(), user.id, workspaceId);
  return member?.role === "owner";
}

export function canManageWorkspaceMembers(user: SessionUser, workspaceId: string): boolean {
  const ws = getWorkspaceById(getDb(), workspaceId);
  if (!ws || ws.is_personal) return false;
  return canEditWorkspace(user, workspaceId);
}

export function canViewConnection(user: SessionUser, connection: ConnectionRow): boolean {
  if (isGlobalAdmin(user)) return true;
  return canViewWorkspace(user, connection.workspace_id);
}

export function canEditConnection(user: SessionUser, connection: ConnectionRow): boolean {
  if (isGlobalAdmin(user)) return true;
  if (connection.owner_id === user.id) return true;
  const member = isWorkspaceMember(getDb(), user.id, connection.workspace_id);
  if (member?.role === "owner") return true;
  return false;
}

export function canViewCredential(user: SessionUser, credential: CredentialRow): boolean {
  if (isGlobalAdmin(user)) return true;
  return canViewWorkspace(user, credential.workspace_id);
}

export function canEditCredential(user: SessionUser, credential: CredentialRow): boolean {
  if (isGlobalAdmin(user)) return true;
  if (credential.owner_id === user.id) return true;
  const member = isWorkspaceMember(getDb(), user.id, credential.workspace_id);
  if (member?.role === "owner") return true;
  return false;
}

export function canMoveToWorkspace(user: SessionUser, workspaceId: string): boolean {
  const ws = getWorkspaceById(getDb(), workspaceId);
  if (!ws) return false;
  if (ws.is_personal) return ws.owner_id === user.id || isGlobalAdmin(user);
  return canViewWorkspace(user, workspaceId);
}

export function credentialInWorkspace(credentialId: string, workspaceId: string): boolean {
  const cred = getDb()
    .prepare("SELECT workspace_id FROM credentials WHERE id = ?")
    .get(credentialId) as { workspace_id: string } | undefined;
  return cred?.workspace_id === workspaceId;
}
