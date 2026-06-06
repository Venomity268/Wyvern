import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb, logAudit } from "@/lib/db/index";
import { canManageWorkspaceMembers, canViewWorkspace } from "@/lib/auth/access";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await requireSession();
  const { id } = await params;

  if (!canViewWorkspace(user, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  return NextResponse.json({ members });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await requireSession();
  const { id } = await params;
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();

  if (!canManageWorkspaceMembers(user, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = getDb()
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email) as { id: string } | undefined;
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = getDb()
    .prepare(
      "SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
    )
    .get(id, target.id);
  if (existing) {
    return NextResponse.json({ error: "User already a member" }, { status: 409 });
  }

  getDb()
    .prepare(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'member')",
    )
    .run(id, target.id);

  logAudit(user.id, "invite", "workspace_member", { workspace_id: id, user_id: target.id, email });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await requireSession();
  const { id } = await params;
  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const ws = getDb()
    .prepare("SELECT * FROM workspaces WHERE id = ?")
    .get(id) as { is_personal: number; owner_id: string } | undefined;
  if (!ws) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const member = getDb()
    .prepare("SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .get(id, userId) as { role: string } | undefined;
  if (!member) {
    return NextResponse.json({ error: "Not a member" }, { status: 404 });
  }

  const selfLeave = userId === user.id;
  if (!selfLeave && !canManageWorkspaceMembers(user, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (member.role === "owner" && ws.owner_id === userId) {
    return NextResponse.json({ error: "Cannot remove workspace owner" }, { status: 400 });
  }

  getDb()
    .prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .run(id, userId);

  logAudit(user.id, "remove", "workspace_member", { workspace_id: id, user_id: userId });

  return NextResponse.json({ ok: true });
}
