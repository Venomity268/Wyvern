import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, SessionUser, getSessionOptions } from "./session-options";

export type { SessionData, SessionUser };

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.user) {
    throw new Error("Unauthorized");
  }
  return session.user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.role !== "admin") {
    throw new Error("Forbidden");
  }
  return user;
}
