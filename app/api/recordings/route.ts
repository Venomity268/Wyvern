import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { recordingFileExists } from "@/lib/recordings/paths";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const userId = session.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb();
    const rows = db
      .prepare(
        `
      SELECT r.id, r.history_id, r.name, r.duration, r.created_at, h.connection_name, h.hostname 
      FROM recordings r
      JOIN connection_history h ON r.history_id = h.id
      WHERE h.user_id = ?
      ORDER BY r.created_at DESC
    `,
      )
      .all(userId) as { id: string }[];

    const deleteOrphan = db.prepare("DELETE FROM recordings WHERE id = ?");
    const validRows = rows.filter((row) => {
      if (recordingFileExists(row.id)) return true;
      deleteOrphan.run(row.id);
      return false;
    });

    return NextResponse.json(validRows);
  } catch (err) {
    console.error("Failed to fetch recordings:", err);
    return NextResponse.json({ error: "Failed to fetch recordings" }, { status: 500 });
  }
}
