import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireSession } from "@/lib/auth/session";
import { getDb, logAudit } from "@/lib/db/index";

export async function PATCH(request: NextRequest) {
  const user = await requireSession();
  const body = await request.json();
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Current and new password required" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const row = getDb()
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(user.id) as { password_hash: string } | undefined;

  if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
  }

  const hash = bcrypt.hashSync(newPassword, 12);
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
  logAudit(user.id, "update", "password", {});

  return NextResponse.json({ ok: true });
}
