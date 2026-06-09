import { getDb } from "@/lib/db/index";
import { resolveGuacMethodCredential, resolveTerminalMethodCredential } from "@/lib/db/connection-methods";

export interface SshAuthInfo {
  defaultUsername: string | null;
  hasStoredCredential: boolean;
}

export function terminalAuthInfo(connection: {
  id: string;
  username: string | null;
  credential_id: string | null;
}, protocol: "ssh" | "telnet"): SshAuthInfo {
  const db = getDb();
  const credentialId = resolveTerminalMethodCredential(db, connection.id, protocol, connection.credential_id);

  if (!credentialId) {
    return { defaultUsername: connection.username, hasStoredCredential: false };
  }

  if (credentialId === "__bastion__") {
    return {
      defaultUsername: connection.username,
      hasStoredCredential: true,
    };
  }

  const cred = db
    .prepare(
      "SELECT username, encrypted_password, encrypted_private_key FROM credentials WHERE id = ?",
    )
    .get(credentialId) as
    | {
        username: string | null;
        encrypted_password: string | null;
        encrypted_private_key: string | null;
      }
    | undefined;

  if (!cred) {
    return { defaultUsername: connection.username, hasStoredCredential: false };
  }

  const defaultUsername = cred.username || connection.username || null;
  const hasStoredCredential = !!(cred.encrypted_password || cred.encrypted_private_key);

  return { defaultUsername, hasStoredCredential };
}

export function guacAuthInfo(
  connection: {
    id: string;
    username: string | null;
    credential_id: string | null;
  },
  protocol: "vnc" | "rdp",
): { defaultUsername: string | null; hasStoredCredential: boolean } {
  const db = getDb();
  const credentialId = resolveGuacMethodCredential(
    db,
    connection.id,
    protocol,
    connection.credential_id,
  );

  if (!credentialId) {
    return { defaultUsername: connection.username, hasStoredCredential: false };
  }

  const cred = db
    .prepare("SELECT username, encrypted_password FROM credentials WHERE id = ?")
    .get(credentialId) as
    | { username: string | null; encrypted_password: string | null }
    | undefined;

  if (!cred?.encrypted_password) {
    return { defaultUsername: connection.username, hasStoredCredential: false };
  }

  const defaultUsername = cred.username || connection.username || null;
  const hasStoredCredential =
    protocol === "vnc" ? true : !!(defaultUsername || cred.username);

  return { defaultUsername, hasStoredCredential };
}
