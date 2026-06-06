import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { avatarUrlForUser } from "@/lib/auth/avatar";

function profileFromDb(userId: string) {
  return getDb()
    .prepare(
      "SELECT id, email, role, display_name, created_at, totp_enabled, avatar_updated_at FROM users WHERE id = ?",
    )
    .get(userId) as
    | {
        id: string;
        email: string;
        role: "user" | "admin";
        display_name: string | null;
        created_at: string;
        totp_enabled: number;
        avatar_updated_at: string | null;
      }
    | undefined;
}

function serializeProfile(profile: NonNullable<ReturnType<typeof profileFromDb>>) {
  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    displayName: profile.display_name,
    createdAt: profile.created_at,
    totpEnabled: profile.totp_enabled === 1,
    avatarUrl: avatarUrlForUser(profile.id, profile.avatar_updated_at),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = profileFromDb(session.user.id);
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ user: serializeProfile(profile) });
}

export async function PATCH(request: NextRequest) {
  const sessionUser = await requireSession();
  const body = await request.json();
  const displayName =
    body.displayName === undefined
      ? undefined
      : String(body.displayName || "").trim() || null;

  if (displayName !== undefined && displayName && displayName.length > 80) {
    return NextResponse.json({ error: "Display name too long" }, { status: 400 });
  }

  const existing = profileFromDb(sessionUser.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (displayName !== undefined) {
    getDb()
      .prepare("UPDATE users SET display_name = ? WHERE id = ?")
      .run(displayName, sessionUser.id);
  }

  const profile = profileFromDb(sessionUser.id)!;

  const session = await getSession();
  session.user = {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    displayName: profile.display_name,
  };
  await session.save();

  return NextResponse.json({ user: serializeProfile(profile) });
}
