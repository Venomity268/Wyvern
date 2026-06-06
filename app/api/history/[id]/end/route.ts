import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { closeLiveSession } from "@/lib/sessions/registry";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const user = await requireSession();
  const { id } = await params;

  const row = getDb()
    .prepare("SELECT * FROM connection_history WHERE id = ? AND user_id = ?")
    .get(id, user.id) as { id: string; status: string } | undefined;

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (row.status !== "active") {
    return NextResponse.json({ error: "Session is not active" }, { status: 400 });
  }

  closeLiveSession(id);

  const current = getDb()
    .prepare("SELECT status FROM connection_history WHERE id = ?")
    .get(id) as { status: string } | undefined;

  if (current?.status === "active") {
    getDb()
      .prepare(
        `UPDATE connection_history
         SET ended_at = datetime('now'), status = 'completed', error_message = 'Ended from dashboard'
         WHERE id = ?`,
      )
      .run(id);
  }

  return NextResponse.json({ ok: true });
}
