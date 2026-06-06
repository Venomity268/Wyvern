"use client";

import { useCallback, useEffect, useState } from "react";
import { SftpClient, canAutoConnectSftp } from "@/lib/sftp/client";
import type { SftpConnectParams } from "@/lib/sftp/protocol";

export interface SessionAuth {
  username: string;
  password?: string;
  privateKey?: string;
}

export function isNeedsSudoError(err: unknown): boolean {
  return err instanceof Error && !!(err as Error & { needsSudo?: boolean }).needsSudo;
}

export function isNeedsAuthError(err: unknown): boolean {
  return err instanceof Error && !!(err as Error & { needsAuth?: boolean }).needsAuth;
}

export function useSftpClient(
  connectionId: string | undefined,
  quickSessionId: string | undefined,
  hasStoredCredential: boolean,
  sessionAuth?: SessionAuth | null,
) {
  const [client] = useState(() => new SftpClient());
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [needsAuth, setNeedsAuth] = useState(
    !canAutoConnectSftp(hasStoredCredential, sessionAuth),
  );
  const [cwd, setCwd] = useState("/");

  const connect = useCallback(
    async (auth?: Partial<SftpConnectParams>) => {
      setConnecting(true);
      setError("");
      try {
        const params: SftpConnectParams = {
          ...(quickSessionId ? { quickSessionId } : { connectionId: connectionId! }),
          username: auth?.username || sessionAuth?.username,
          password: auth?.password || sessionAuth?.password,
          privateKey: auth?.privateKey || sessionAuth?.privateKey,
        };
        const resolvedCwd = await client.connect(params);
        setCwd(resolvedCwd);
        setReady(true);
        setNeedsAuth(false);
      } catch (err) {
        setReady(false);
        if (isNeedsAuthError(err)) {
          setNeedsAuth(true);
        }
        setError(err instanceof Error ? err.message : "SFTP connection failed");
      } finally {
        setConnecting(false);
      }
    },
    [connectionId, client, quickSessionId, sessionAuth],
  );

  const withSudoRetry = useCallback(
    async <T>(fn: () => Promise<T>, onNeedsSudo: () => Promise<string | null>): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        if (!isNeedsSudoError(err)) throw err;
        const password = await onNeedsSudo();
        if (!password) throw err;
        await client.setSudoPassword(password);
        return fn();
      }
    },
    [client],
  );

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (canAutoConnectSftp(hasStoredCredential, sessionAuth)) {
      timeout = setTimeout(() => {
        void connect();
      }, 0);
    }
    return () => {
      clearTimeout(timeout);
      client.disconnect();
    };
  }, [connectionId, quickSessionId, client, connect, hasStoredCredential, sessionAuth]);

  return {
    client,
    ready,
    connecting,
    error,
    setError,
    needsAuth,
    cwd,
    setCwd,
    connect,
    withSudoRetry,
  };
}
