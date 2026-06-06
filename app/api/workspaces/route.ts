import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireSession } from "@/lib/auth/session";
import {
  getDb,
  logAudit,
  listWorkspacesForUser,
  createPersonalWorkspace,
} from "@/lib/db/index";
import { canViewWorkspace } from "@/lib/auth/access";

export async function GET() {
  const user = await requireSession();
  createPersonalWorkspace(getDb(), user.id);
  const workspaces = listWorkspacesForUser(getDb(), user.id);
  return NextResponse.json({ workspaces });
}

export async function POST(request: NextRequest) {
  const user = await requireSession();
  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const id = uuidv4();
  getDb()
    .prepare("INSERT INTO workspaces (id, name, owner_id, is_personal) VALUES (?, ?, ?, 0)")
    .run(id, name, user.id);
  getDb()
    .prepare(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')",
    )
    .run(id, user.id);

  logAudit(user.id, "create", "workspace", { id, name });

  const workspace = getDb().prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
  return NextResponse.json({ workspace }, { status: 201 });
}
