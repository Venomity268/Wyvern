import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, createPersonalWorkspace } from "@/lib/db/index";

export async function GET() {
  await requireAdmin();

  const users = getDb()
    .prepare("SELECT id, email, role, created_at FROM users ORDER BY created_at ASC")
    .all();

  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  const { email, password, role } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const existing = getDb().prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 12);

  getDb()
    .prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(id, email, hash, role || "user");

  createPersonalWorkspace(getDb(), id);

  return NextResponse.json(
    { user: { id, email, role: role || "user" } },
    { status: 201 },
  );
}
