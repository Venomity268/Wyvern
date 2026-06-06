import { Client } from "ssh2";
import { getDb } from "../db/index";
import { getMethodPort, resolveSshMethodCredential } from "../db/connection-methods";
import { decryptSecret } from "../crypto/secrets";
import { canViewConnection } from "../auth/access";
import type { SessionUser } from "../auth/session-options";
import { getOrCreateBastionKeypair, normalizePrivateKeyForSsh2 } from "../ssh/ssh-keys";

export interface ResolvedSshConnection {
  connection: {
    id: string;
    workspace_id: string;
    owner_id: string | null;
    name: string;
    hostname: string;
    port: number;
    protocol: string;
    username: string | null;
    credential_id: string | null;
  };
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface SshAuthParams {
  username?: string;
  password?: string;
  privateKey?: string;
}

export function resolveSshConnection(
  user: SessionUser,
  connectionId: string | undefined,
  auth?: SshAuthParams,
): ResolvedSshConnection | { error: string; needsAuth?: boolean } {
  const id = typeof connectionId === "string" ? connectionId.trim() : "";
  if (!id) {
    return { error: "Connection id required", needsAuth: true };
  }

  const db = getDb();
  const connection = db
    .prepare("SELECT * FROM connections WHERE id = ?")
    .get(id) as ResolvedSshConnection["connection"] | undefined;

  if (!connection) {
    return { error: "Connection not found" };
  }

  const sshPort = getMethodPort(db, id, "ssh");
  if (sshPort === null && connection.protocol !== "ssh") {
    return { error: "SSH is not enabled for this connection" };
  }

  const resolvedConnection = {
    ...connection,
    port: sshPort ?? connection.port,
    protocol: "ssh",
  };

  if (
    !canViewConnection(user, {
      ...resolvedConnection,
      protocol: "ssh",
    })
  ) {
    return { error: "Access denied" };
  }

  let password = auth?.password;
  let privateKey = auth?.privateKey;
  let passphrase: string | undefined;

  const credentialId = resolveSshMethodCredential(
    db,
    id,
    connection.credential_id,
  );

  let username = auth?.username || undefined;

  if (credentialId === "__bastion__") {
    const keypair = getOrCreateBastionKeypair();
    privateKey = keypair.privateKey;
  } else if (credentialId) {
    const cred = db
      .prepare("SELECT * FROM credentials WHERE id = ?")
      .get(credentialId) as {
      workspace_id: string;
      encrypted_password: string | null;
      encrypted_private_key: string | null;
      encrypted_passphrase: string | null;
      username: string | null;
    } | undefined;

    if (cred) {
      if (cred.workspace_id !== connection.workspace_id) {
        return { error: "Credential workspace mismatch" };
      }
      if (!username && cred.username) {
        username = cred.username;
      }
      if (cred.encrypted_password && !password) {
        password = decryptSecret(cred.encrypted_password);
      }
      if (cred.encrypted_private_key && !privateKey) {
        privateKey = normalizePrivateKeyForSsh2(decryptSecret(cred.encrypted_private_key));
      }
      if (cred.encrypted_passphrase) {
        passphrase = decryptSecret(cred.encrypted_passphrase);
      }
    }
  }

  if (!username) {
    username = connection.username ?? undefined;
  }

  if (!username) {
    return { error: "Username required", needsAuth: true };
  }

  if (!password && !privateKey) {
    return { error: "Credentials required", needsAuth: true };
  }

  if (privateKey) {
    privateKey = normalizePrivateKeyForSsh2(privateKey);
  }

  return {
    connection: resolvedConnection,
    username,
    password,
    privateKey,
    passphrase,
  };
}

export function connectSshClient(
  resolved: ResolvedSshConnection,
  onReady: (client: Client) => void,
  onError: (err: Error) => void,
): Client {
  const client = new Client();
  const connectConfig: Record<string, unknown> = {
    host: resolved.connection.hostname,
    port: resolved.connection.port || 22,
    username: resolved.username,
  };

  if (resolved.privateKey) {
    connectConfig.privateKey = normalizePrivateKeyForSsh2(resolved.privateKey);
    if (resolved.passphrase) connectConfig.passphrase = resolved.passphrase;
  } else if (resolved.password) {
    connectConfig.password = resolved.password;
  }

  client.on("ready", () => onReady(client));
  client.on("error", onError);
  try {
    client.connect(connectConfig);
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
  return client;
}
