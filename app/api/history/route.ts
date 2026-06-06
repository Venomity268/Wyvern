import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";

export async function GET() {
  const user = await requireSession();

  const history = getDb()
    .prepare(
      `SELECT * FROM connection_history WHERE user_id = ?
       ORDER BY started_at DESC LIMIT 50`,
    )
    .all(user.id);

  return NextResponse.json({ history });
}
