import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireSession } from "@/lib/auth/session";
import { getDb, logAudit } from "@/lib/db/index";
import { canViewWorkspace } from "@/lib/auth/access";

export async function GET(request: NextRequest) {
  const user = await requireSession();
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId parameter required" }, { status: 400 });
  }

  if (!canViewWorkspace(user, workspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const folders = getDb()
    .prepare("SELECT * FROM folders WHERE workspace_id = ? ORDER BY name ASC")
    .all(workspaceId) as Record<string, unknown>[];

  return NextResponse.json({ folders });
}

export async function POST(request: NextRequest) {
  const user = await requireSession();
  const body = await request.json();

  const workspaceId = body.workspace_id as string;
  const name = String(body.name || "").trim();
  const parentId = body.parent_id as string | null || null;

  if (!workspaceId || !name) {
    return NextResponse.json({ error: "workspace_id and name are required" }, { status: 400 });
  }

  if (!canViewWorkspace(user, workspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Optional: check if parent folder exists and is in the same workspace
  if (parentId) {
    const parent = getDb()
      .prepare("SELECT workspace_id FROM folders WHERE id = ?")
      .get(parentId) as { workspace_id: string } | undefined;
    if (!parent || parent.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Parent folder not found or in a different workspace" }, { status: 400 });
    }
  }

  const id = uuidv4();
  getDb()
    .prepare("INSERT INTO folders (id, workspace_id, name, parent_id) VALUES (?, ?, ?, ?)")
    .run(id, workspaceId, name, parentId);

  logAudit(user.id, "create", "folder", { id, name, workspace_id: workspaceId });

  const folder = getDb().prepare("SELECT * FROM folders WHERE id = ?").get(id);
  return NextResponse.json({ folder }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await requireSession();
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existing = getDb()
    .prepare("SELECT * FROM folders WHERE id = ?")
    .get(id) as { id: string; name: string; workspace_id: string; parent_id: string | null } | undefined;

  if (!existing) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  if (!canViewWorkspace(user, existing.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = updates.name !== undefined ? String(updates.name || "").trim() : existing.name;
  let parentId = existing.parent_id;

  if (updates.parent_id !== undefined) {
    parentId = updates.parent_id || null;
    if (parentId) {
      // prevent cycle or invalid parent
      if (parentId === id) {
        return NextResponse.json({ error: "A folder cannot be its own parent" }, { status: 400 });
      }
      // Check for cycles recursively: ensure parentId is not a descendant of id
      let currentParentId: string | null = parentId;
      while (currentParentId) {
        if (currentParentId === id) {
          return NextResponse.json({ error: "Cannot move a folder into one of its descendants (would create a cycle)" }, { status: 400 });
        }
        const parentFolder = getDb()
          .prepare("SELECT parent_id FROM folders WHERE id = ?")
          .get(currentParentId) as { parent_id: string | null } | undefined;
        currentParentId = parentFolder ? parentFolder.parent_id : null;
      }
      const parent = getDb()
        .prepare("SELECT workspace_id FROM folders WHERE id = ?")
        .get(parentId) as { workspace_id: string } | undefined;
      if (!parent || parent.workspace_id !== existing.workspace_id) {
        return NextResponse.json({ error: "Parent folder not found or in a different workspace" }, { status: 400 });
      }
    }
  }

  if (!name) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }

  getDb()
    .prepare("UPDATE folders SET name = ?, parent_id = ? WHERE id = ?")
    .run(name, parentId, id);

  logAudit(user.id, "update", "folder", { id, name });

  const folder = getDb().prepare("SELECT * FROM folders WHERE id = ?").get(id);
  return NextResponse.json({ folder });
}

export async function DELETE(request: NextRequest) {
  const user = await requireSession();
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existing = getDb()
    .prepare("SELECT * FROM folders WHERE id = ?")
    .get(id) as { id: string; name: string; workspace_id: string } | undefined;

  if (!existing) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  if (!canViewWorkspace(user, existing.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  getDb().prepare("DELETE FROM folders WHERE id = ?").run(id);

  logAudit(user.id, "delete", "folder", { id, name: existing.name });

  return NextResponse.json({ ok: true });
}
