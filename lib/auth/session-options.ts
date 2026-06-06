import { SessionOptions } from "iron-session";

export interface SessionUser {
  id: string;
  email: string;
  role: "user" | "admin";
  displayName?: string | null;
}

export interface SessionData {
  user?: SessionUser;
  isLoggedIn: boolean;
}

export function getSessionOptions(): SessionOptions {
  return {
    password:
      process.env.SESSION_SECRET || "complex_password_at_least_32_characters_long",
    cookieName: "wterm_bastion_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 7,
    },
  };
}
