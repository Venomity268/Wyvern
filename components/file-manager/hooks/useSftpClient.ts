"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const clientRef = useRef<SftpClient | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [needsAuth, setNeedsAuth] = useState(
    !canAutoConnectSftp(hasStoredCredential, sessionAuth),
  );
  const [cwd, setCwd] = useState("/");

  const getClient = useCallback(() => {
    if (!clientRef.current) clientRef.current = new SftpClient();
    return clientRef.current;
  }, []);

  const connect = useCallback(
    async (auth?: Partial<SftpConnectParams>) => {
      setConnecting(true);
      setError("");
      const client = getClient();
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
    [connectionId, getClient, quickSessionId, sessionAuth],
  );

  const withSudoRetry = useCallback(
    async <T>(fn: () => Promise<T>, onNeedsSudo: () => Promise<string | null>): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        if (!isNeedsSudoError(err)) throw err;
        const password = await onNeedsSudo();
        if (!password) throw err;
        await getClient().setSudoPassword(password);
        return fn();
      }
    },
    [getClient],
  );

  useEffect(() => {
    if (canAutoConnectSftp(hasStoredCredential, sessionAuth)) {
      void connect();
    }
    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, [connectionId, quickSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    client: getClient(),
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
