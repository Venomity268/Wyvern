import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { closeLiveSessionsForConnection } from "@/lib/sessions/registry";

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

/** End active sessions for a connection when the client navigates away. */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const user = await requireSession();
  const { connectionId } = await params;

  closeLiveSessionsForConnection(user.id, connectionId);

  getDb()
    .prepare(
      `UPDATE connection_history
       SET ended_at = datetime('now'), status = 'completed', error_message = 'Session closed'
       WHERE user_id = ? AND connection_id = ? AND status = 'active'`,
    )
    .run(user.id, connectionId);

  return NextResponse.json({ ok: true });
}
