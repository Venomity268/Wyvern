import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireSession } from "@/lib/auth/session";
import { getDb, logAudit } from "@/lib/db/index";

export async function POST(request: NextRequest) {
  const sessionUser = await requireSession();
  const { password } = await request.json();

  if (!password) {
    return NextResponse.json({ error: "Password is required to disable 2FA" }, { status: 400 });
  }

  const user = getDb()
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(sessionUser.id) as { password_hash: string } | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  getDb()
    .prepare("UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?")
    .run(sessionUser.id);

  logAudit(sessionUser.id, "disable_totp", "user", { id: sessionUser.id });

  return NextResponse.json({ success: true });
}
