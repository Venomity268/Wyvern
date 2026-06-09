import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const userId = session.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT r.id 
      FROM recordings r
      JOIN connection_history h ON r.history_id = h.id
      WHERE r.id = ? AND h.user_id = ?
    `).get(id, userId);

    if (!row) {
      console.log("Recording row not found for", id, userId);
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const castPath = path.join(process.cwd(), "data", "recordings", `${id}.cast`);
    if (!fs.existsSync(castPath)) {
      console.log("File not found on disk:", castPath);
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
    }

    const stat = fs.statSync(castPath);
    const stream = fs.createReadStream(castPath);

    return new NextResponse(stream as any, {
      headers: {
        "Content-Type": "application/x-asciicast",
        "Content-Length": stat.size.toString(),
      },
    });
  } catch (err) {
    console.error("Failed to stream recording:", err);
    return NextResponse.json({ error: "Failed to stream recording" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const userId = session.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT r.id 
      FROM recordings r
      JOIN connection_history h ON r.history_id = h.id
      WHERE r.id = ? AND h.user_id = ?
    `).get(id, userId);

    if (!row) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const castPath = path.join(process.cwd(), "data", "recordings", `${id}.cast`);
    if (fs.existsSync(castPath)) {
      fs.unlinkSync(castPath);
    }

    db.prepare("DELETE FROM recordings WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete recording:", err);
    return NextResponse.json({ error: "Failed to delete recording" }, { status: 500 });
  }
}
