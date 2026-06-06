import { createHmac, randomBytes } from "crypto";
import { APP_NAME } from "@/lib/brand";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const buffer = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) {
      throw new Error("Invalid base32 character");
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      buffer.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(buffer);
}

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

export function generateTotpSecret(): string {
  // Generate 20 random bytes (160 bits, standard for TOTP)
  const bytes = randomBytes(20);
  return base32Encode(bytes);
}

export function generateTotpToken(secret: string, timeStepIndex: number): string {
  const key = base32Decode(secret);
  
  // Counter is 8-byte big-endian representation of time step index
  const counter = Buffer.alloc(8);
  counter.writeBigInt64BE(BigInt(timeStepIndex), 0);

  const hmac = createHmac("sha1", key);
  hmac.update(counter);
  const hmacResult = hmac.digest();

  // Dynamic truncation
  const offset = hmacResult[hmacResult.length - 1] & 0xf;
  const code =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  const token = (code % 1000000).toString().padStart(6, "0");
  return token;
}

export function verifyTotpToken(secret: string, token: string, window = 1): boolean {
  const cleanToken = token.trim();
  if (cleanToken.length !== 6 || isNaN(Number(cleanToken))) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const currentTimeStep = Math.floor(nowSeconds / 30);

  for (let i = -window; i <= window; i++) {
    const testToken = generateTotpToken(secret, currentTimeStep + i);
    if (testToken === cleanToken) {
      return true;
    }
  }
  return false;
}

export function getTotpAuthUri(email: string, secret: string): string {
  const label = encodeURIComponent(`${APP_NAME}:${email}`);
  const issuer = encodeURIComponent(APP_NAME);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
}
