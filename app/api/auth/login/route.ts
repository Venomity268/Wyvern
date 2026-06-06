import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = getDb()
    .prepare("SELECT id, email, password_hash, role, display_name FROM users WHERE email = ?")
    .get(email) as {
    id: string;
    email: string;
    password_hash: string;
    role: "user" | "admin";
    display_name: string | null;
  } | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const session = await getSession();
  session.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.display_name,
  };
  session.isLoggedIn = true;
  await session.save();

  return NextResponse.json({ user: session.user });
}
