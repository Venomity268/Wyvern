import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { encryptSecret } from "@/lib/crypto/secrets";
import { generateTotpSecret, getTotpAuthUri } from "@/lib/crypto/totp";

export async function POST() {
  const sessionUser = await requireSession();

  // Generate secret
  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);

  // Store in DB with totp_enabled = 0 until verified
  getDb()
    .prepare("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?")
    .run(encrypted, sessionUser.id);

  const qrUri = getTotpAuthUri(sessionUser.email, secret);

  return NextResponse.json({
    secret,
    qrUri,
  });
}
