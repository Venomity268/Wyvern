import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { closeLiveSessionsForConnection } from "@/lib/sessions/registry";

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

/** End active sessions for a connection when the client navigates away. */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSession();
    const { connectionId } = await params;

    if (!connectionId) {
      return NextResponse.json({ error: "connectionId required" }, { status: 400 });
    }

    closeLiveSessionsForConnection(user.id, connectionId);

    getDb()
      .prepare(
        `UPDATE connection_history
         SET ended_at = datetime('now'), status = 'completed', error_message = 'Session closed'
         WHERE user_id = ? AND connection_id = ? AND status = 'active'`,
      )
      .run(user.id, connectionId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[history/end-connection]", err);
    return NextResponse.json({ error: "Failed to end session" }, { status: 500 });
  }
}
