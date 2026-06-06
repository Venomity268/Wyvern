import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";

export async function GET() {
  await requireAdmin();

  const entries = getDb()
    .prepare(
      `SELECT a.*, u.email as user_email FROM audit_log a
       JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT 100`,
    )
    .all();

  return NextResponse.json({ entries });
}
