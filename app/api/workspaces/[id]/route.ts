import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb, logAudit } from "@/lib/db/index";
import {
  canEditWorkspace,
  canViewWorkspace,
  canManageWorkspaceMembers,
} from "@/lib/auth/access";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await requireSession();
  const { id } = await params;

  if (!canViewWorkspace(user, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const workspace = getDb().prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const members = getDb()
    .prepare(
      `SELECT wm.user_id, wm.role, wm.joined_at, u.email
       FROM workspace_members wm
       INNER JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = ?
       ORDER BY wm.role DESC, u.email ASC`,
    )
    .all(id);

  return NextResponse.json({ workspace, members });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await requireSession();
  const { id } = await params;
  const body = await request.json();

  const workspace = getDb()
    .prepare("SELECT * FROM workspaces WHERE id = ?")
    .get(id) as { is_personal: number } | undefined;
  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (workspace.is_personal) {
    return NextResponse.json({ error: "Cannot rename personal workspace" }, { status: 400 });
  }
  if (!canEditWorkspace(user, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  getDb()
    .prepare("UPDATE workspaces SET name = ? WHERE id = ?")
    .run(name, id);
  logAudit(user.id, "update", "workspace", { id, name });

  const updated = getDb().prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
  return NextResponse.json({ workspace: updated });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const user = await requireSession();
  const { id } = await params;

  const workspace = getDb()
    .prepare("SELECT * FROM workspaces WHERE id = ?")
    .get(id) as { is_personal: number } | undefined;
  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (workspace.is_personal) {
    return NextResponse.json({ error: "Cannot delete personal workspace" }, { status: 400 });
  }
  if (!canEditWorkspace(user, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const connCount = getDb()
    .prepare("SELECT COUNT(*) as c FROM connections WHERE workspace_id = ?")
    .get(id) as { c: number };
  if (connCount.c > 0) {
    return NextResponse.json(
      { error: "Workspace has connections; remove them first" },
      { status: 400 },
    );
  }

  getDb().prepare("DELETE FROM workspaces WHERE id = ?").run(id);
  logAudit(user.id, "delete", "workspace", { id });

  return NextResponse.json({ ok: true });
}
