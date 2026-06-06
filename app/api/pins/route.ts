import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { canViewConnection, type ConnectionRow } from "@/lib/auth/access";
import { attachMethods } from "@/lib/db/connection-methods";
import { attachHostInfoSummary } from "@/lib/db/host-info";

export async function GET() {
  try {
    const user = await requireSession();
    const rows = getDb()
      .prepare(
        `SELECT c.* FROM connections c
         INNER JOIN pinned_connections p ON p.connection_id = c.id
         WHERE p.user_id = ?
         ORDER BY p.pinned_at DESC`,
      )
      .all(user.id) as { id: string }[];

    const connections = attachHostInfoSummary(getDb(), attachMethods(rows));
    return NextResponse.json({ connections });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to list pins" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    const { connectionId } = await request.json();

    if (!connectionId) {
      return NextResponse.json({ error: "connectionId required" }, { status: 400 });
    }

    const connection = getDb()
      .prepare("SELECT * FROM connections WHERE id = ?")
      .get(connectionId) as ConnectionRow | undefined;

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    if (!canViewConnection(user, connection)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = getDb()
      .prepare(
        "SELECT 1 FROM pinned_connections WHERE user_id = ? AND connection_id = ?",
      )
      .get(user.id, connectionId);

    if (existing) {
      getDb()
        .prepare("DELETE FROM pinned_connections WHERE user_id = ? AND connection_id = ?")
        .run(user.id, connectionId);
      return NextResponse.json({ pinned: false });
    }

    getDb()
      .prepare(
        "INSERT INTO pinned_connections (user_id, connection_id) VALUES (?, ?)",
      )
      .run(user.id, connectionId);

    return NextResponse.json({ pinned: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update pin" }, { status: 500 });
  }
}
