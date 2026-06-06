import { createHash } from "crypto";

const DEFAULT_WS_INACTIVITY_MS = 8 * 60 * 60 * 1000;
const DEFAULT_GUACD_IDLE_MS = 60 * 60 * 1000;

/** WebSocket inactivity limit (ms). Set GUAC_MAX_INACTIVITY_MS=0 to disable. Client sends keepalive nops every 30s. */

export function getGuacMaxInactivityMs(): number {
  const raw = process.env.GUAC_MAX_INACTIVITY_MS;
  if (raw === undefined || raw === "") return DEFAULT_WS_INACTIVITY_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_WS_INACTIVITY_MS;
}

export function getGuacdIdleMs(): number {
  const raw = process.env.GUAC_GUACD_IDLE_MS;
  if (raw === undefined || raw === "") return DEFAULT_GUACD_IDLE_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_GUACD_IDLE_MS;
}

export function getGuacTokenSecret(): string {
  const key = process.env.GUAC_TOKEN_SECRET;
  if (!key || key.length < 32) {
    throw new Error("GUAC_TOKEN_SECRET must be at least 32 characters");
  }
  return key;
}

/** AES-256-CBC requires exactly 32 bytes; derive from any long-enough secret. */
export function getGuacEncryptionKey(): Buffer {
  return createHash("sha256").update(getGuacTokenSecret()).digest();
}

export function getGuacdOptions() {
  return {
    host: process.env.GUACD_HOST || "127.0.0.1",
    port: Number(process.env.GUACD_PORT || 4822),
  };
}

export function getGuacClientOptions() {
  return {
    maxInactivityTime: getGuacMaxInactivityMs(),
    crypt: {
      cypher: "AES-256-CBC",
      key: getGuacEncryptionKey(),
    },
  };
}
