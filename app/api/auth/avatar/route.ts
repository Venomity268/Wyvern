import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import {
  avatarUrlForUser,
  readAvatarForUser,
  removeAvatarFiles,
  saveAvatarFromDataUrl,
} from "@/lib/auth/avatar";

function profileAvatarUpdatedAt(userId: string): string | null {
  const row = getDb()
    .prepare("SELECT avatar_updated_at FROM users WHERE id = ?")
    .get(userId) as { avatar_updated_at: string | null } | undefined;
  return row?.avatar_updated_at ?? null;
}

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const avatar = readAvatarForUser(session.user.id);
  if (!avatar) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(avatar.buffer), {
    headers: {
      "Content-Type": avatar.mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await requireSession();
  const body = await request.json();
  const avatarDataUrl = typeof body.avatarDataUrl === "string" ? body.avatarDataUrl : "";

  if (!avatarDataUrl) {
    return NextResponse.json({ error: "Image required" }, { status: 400 });
  }

  try {
    saveAvatarFromDataUrl(user.id, avatarDataUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save avatar";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  getDb()
    .prepare("UPDATE users SET avatar_updated_at = ? WHERE id = ?")
    .run(updatedAt, user.id);

  return NextResponse.json({
    avatarUrl: avatarUrlForUser(user.id, updatedAt),
  });
}

export async function DELETE() {
  const user = await requireSession();

  removeAvatarFiles(user.id);
  getDb()
    .prepare("UPDATE users SET avatar_updated_at = NULL WHERE id = ?")
    .run(user.id);

  return NextResponse.json({ ok: true });
}
