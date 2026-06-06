import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb, logAudit } from "@/lib/db/index";
import { decryptSecret } from "@/lib/crypto/secrets";
import { verifyTotpToken } from "@/lib/crypto/totp";

export async function POST(request: NextRequest) {
  const sessionUser = await requireSession();
  const { code } = await request.json();

  if (!code) {
    return NextResponse.json({ error: "Code is required" }, { status: 400 });
  }

  const user = getDb()
    .prepare("SELECT totp_secret FROM users WHERE id = ?")
    .get(sessionUser.id) as { totp_secret: string | null } | undefined;

  if (!user || !user.totp_secret) {
    return NextResponse.json({ error: "2FA not set up. Call setup first." }, { status: 400 });
  }

  const decrypted = decryptSecret(user.totp_secret);
  const isValid = verifyTotpToken(decrypted, code);

  if (!isValid) {
    return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
  }

  getDb()
    .prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?")
    .run(sessionUser.id);

  logAudit(sessionUser.id, "enable_totp", "user", { id: sessionUser.id });

  return NextResponse.json({ success: true });
}
