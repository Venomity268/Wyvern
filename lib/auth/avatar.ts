import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { userInitials } from "@/lib/user-display";

export { userInitials };

const AVATAR_EXTENSIONS = ["webp", "jpeg", "jpg", "png"] as const;
const MAX_AVATAR_BYTES = 150_000;

export function getAvatarDir(): string {
  const dir = join(process.cwd(), "data", "avatars");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function avatarFileForUser(userId: string): string | null {
  const dir = getAvatarDir();
  for (const ext of AVATAR_EXTENSIONS) {
    const path = join(dir, `${userId}.${ext}`);
    if (existsSync(path)) return path;
  }
  return null;
}

export function avatarMimeForPath(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export function avatarUrlForUser(userId: string, avatarUpdatedAt: string | null | undefined): string | null {
  if (!avatarUpdatedAt || !avatarFileForUser(userId)) return null;
  return `/api/auth/avatar?v=${encodeURIComponent(avatarUpdatedAt)}`;
}

export function removeAvatarFiles(userId: string): void {
  const dir = getAvatarDir();
  for (const file of readdirSync(dir)) {
    if (file.startsWith(`${userId}.`)) {
      unlinkSync(join(dir, file));
    }
  }
}

export function saveAvatarFromDataUrl(userId: string, dataUrl: string): { ext: string; bytes: number } {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid image format");
  }

  const ext = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");

  if (buffer.length === 0 || buffer.length > MAX_AVATAR_BYTES) {
    throw new Error("Image too large");
  }

  removeAvatarFiles(userId);
  writeFileSync(join(getAvatarDir(), `${userId}.${ext}`), buffer);
  return { ext, bytes: buffer.length };
}

export function readAvatarForUser(userId: string): { buffer: Buffer; mime: string } | null {
  const path = avatarFileForUser(userId);
  if (!path) return null;
  return {
    buffer: readFileSync(path),
    mime: avatarMimeForPath(path),
  };
}
