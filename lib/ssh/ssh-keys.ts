import crypto from "crypto";
import fs from "fs";
import path from "path";

function convertPemToSsh(pemKey: string): string {
  const keyObject = crypto.createPublicKey(pemKey);
  const jwk = keyObject.export({ format: "jwk" }) as { n: string; e: string };

  const n = Buffer.from(jwk.n, "base64url");
  const e = Buffer.from(jwk.e, "base64url");

  function writeField(data: Buffer): Buffer {
    let finalData = data;
    if (data[0] >= 0x80) {
      finalData = Buffer.concat([Buffer.alloc(1, 0), data]);
    }
    const len = Buffer.alloc(4);
    len.writeUInt32BE(finalData.length);
    return Buffer.concat([len, finalData]);
  }

  const type = Buffer.from("ssh-rsa");
  const sshKey = Buffer.concat([writeField(type), writeField(e), writeField(n)]);

  return `ssh-rsa ${sshKey.toString("base64")}`;
}

/** ssh2 only accepts PKCS#1 / OpenSSH / SEC1 PEM — not generic PKCS#8 (`BEGIN PRIVATE KEY`). */
export function normalizePrivateKeyForSsh2(pem: string): string {
  const trimmed = pem.trim();
  if (!trimmed) return trimmed;

  if (
    trimmed.includes("BEGIN RSA PRIVATE KEY") ||
    trimmed.includes("BEGIN OPENSSH PRIVATE KEY") ||
    trimmed.includes("BEGIN EC PRIVATE KEY") ||
    trimmed.includes("BEGIN DSA PRIVATE KEY")
  ) {
    return trimmed;
  }

  if (
    trimmed.includes("BEGIN PRIVATE KEY") ||
    trimmed.includes("BEGIN ENCRYPTED PRIVATE KEY")
  ) {
    const key = crypto.createPrivateKey(trimmed);
    const type = key.asymmetricKeyType;
    if (type === "rsa") {
      return key.export({ type: "pkcs1", format: "pem" }) as string;
    }
    if (type === "ec") {
      return key.export({ type: "sec1", format: "pem" }) as string;
    }
  }

  return trimmed;
}

const KEYS_DIR = path.join(process.cwd(), "data", "keys");
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, "id_rsa");
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, "id_rsa.pub");

export function getOrCreateBastionKeypair() {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    const rawPrivate = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");
    const privateKey = normalizePrivateKeyForSsh2(rawPrivate);
    if (privateKey !== rawPrivate) {
      fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
    }
    return {
      privateKey,
      publicKey: fs.readFileSync(PUBLIC_KEY_PATH, "utf8"),
    };
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs1",
      format: "pem",
    },
  });

  const sshPublicKey = convertPemToSsh(publicKey);

  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY_PATH, sshPublicKey);

  return {
    privateKey,
    publicKey: sshPublicKey,
  };
}
