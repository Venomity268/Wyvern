import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { closeLiveSessionsForConnection } from "@/lib/sessions/registry";

interface RouteParams {
  params: Promise<{ quickSessionId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const user = await requireSession();
  const { quickSessionId } = await params;

  closeLiveSessionsForConnection(user.id, quickSessionId);

  getDb()
    .prepare(
      `UPDATE connection_history
       SET ended_at = datetime('now'), status = 'completed', error_message = 'Session closed'
       WHERE user_id = ? AND quick_session_id = ? AND status = 'active'`,
    )
    .run(user.id, quickSessionId);

  return NextResponse.json({ ok: true });
}
