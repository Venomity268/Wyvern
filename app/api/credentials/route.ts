import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireSession } from "@/lib/auth/session";
import { getDb, logAudit } from "@/lib/db/index";
import { encryptSecret } from "@/lib/crypto/secrets";
import {
  canEditCredential,
  canViewWorkspace,
  canMoveToWorkspace,
} from "@/lib/auth/access";

export async function GET(request: NextRequest) {
  const user = await requireSession();
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");

  if (workspaceId) {
    if (!canViewWorkspace(user, workspaceId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const credentials = getDb()
      .prepare(
        `SELECT id, workspace_id, owner_id, label, username, created_at, updated_at,
         (encrypted_password IS NOT NULL) AS has_password,
         (encrypted_private_key IS NOT NULL) AS has_private_key,
         (encrypted_passphrase IS NOT NULL) AS has_passphrase
         FROM credentials WHERE workspace_id = ? ORDER BY label ASC`,
      )
      .all(workspaceId);
    return NextResponse.json({ credentials });
  }

  if (user.role === "admin") {
    const credentials = getDb()
      .prepare(
        "SELECT id, workspace_id, owner_id, label, username, created_at, updated_at FROM credentials ORDER BY label ASC",
      )
      .all();
    return NextResponse.json({ credentials });
  }

  const credentials = getDb()
    .prepare(
      `SELECT c.id, c.workspace_id, c.owner_id, c.label, c.username, c.created_at, c.updated_at
       FROM credentials c
       INNER JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
       WHERE wm.user_id = ?
       ORDER BY c.label ASC`,
    )
    .all(user.id);

  return NextResponse.json({ credentials });
}

export async function POST(request: NextRequest) {
  const user = await requireSession();
  const body = await request.json();
  const workspaceId = body.workspace_id as string;

  if (!workspaceId || !canMoveToWorkspace(user, workspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = uuidv4();

  getDb()
    .prepare(
      `INSERT INTO credentials (id, workspace_id, owner_id, label, username, encrypted_password, encrypted_private_key, encrypted_passphrase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      workspaceId,
      user.id,
      body.label,
      body.username || null,
      body.password ? encryptSecret(body.password) : null,
      body.privateKey ? encryptSecret(body.privateKey) : null,
      body.passphrase ? encryptSecret(body.passphrase) : null,
    );

  logAudit(user.id, "create", "credential", { id, label: body.label, workspace_id: workspaceId });

  const credential = getDb()
    .prepare(
      "SELECT id, workspace_id, owner_id, label, username, created_at FROM credentials WHERE id = ?",
    )
    .get(id);
  return NextResponse.json({ credential }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await requireSession();
  const body = await request.json();
  const { id, ...updates } = body;

  const existing = getDb().prepare("SELECT * FROM credentials WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canEditCredential(user, existing as Parameters<typeof canEditCredential>[1])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targetWorkspaceId = updates.workspace_id as string | undefined;
  if (targetWorkspaceId && !canMoveToWorkspace(user, targetWorkspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ex = existing as {
    label: string;
    username: string | null;
    encrypted_password: string | null;
    encrypted_private_key: string | null;
    encrypted_passphrase: string | null;
    workspace_id: string;
  };

  getDb()
    .prepare(
      `UPDATE credentials SET label = ?, username = ?,
       encrypted_password = COALESCE(?, encrypted_password),
       encrypted_private_key = COALESCE(?, encrypted_private_key),
       encrypted_passphrase = COALESCE(?, encrypted_passphrase),
       workspace_id = COALESCE(?, workspace_id),
       updated_at = datetime('now') WHERE id = ?`,
    )
    .run(
      updates.label ?? ex.label,
      updates.username ?? ex.username,
      updates.password ? encryptSecret(updates.password) : null,
      updates.privateKey ? encryptSecret(updates.privateKey) : null,
      updates.passphrase ? encryptSecret(updates.passphrase) : null,
      targetWorkspaceId ?? null,
      id,
    );

  logAudit(user.id, targetWorkspaceId ? "move" : "update", "credential", {
    id,
    workspace_id: targetWorkspaceId,
  });

  const credential = getDb()
    .prepare(
      "SELECT id, workspace_id, owner_id, label, username, created_at FROM credentials WHERE id = ?",
    )
    .get(id);
  return NextResponse.json({ credential });
}

export async function DELETE(request: NextRequest) {
  const user = await requireSession();
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = getDb().prepare("SELECT * FROM credentials WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canEditCredential(user, existing as Parameters<typeof canEditCredential>[1])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  getDb().prepare("DELETE FROM credentials WHERE id = ?").run(id);
  logAudit(user.id, "delete", "credential", { id });

  return NextResponse.json({ ok: true });
}
