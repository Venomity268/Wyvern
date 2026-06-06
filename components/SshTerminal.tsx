"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SessionLayout } from "@/components/SessionLayout";
import { wsUrl } from "@/lib/utils";
import { useDisconnectOnLeave } from "@/lib/hooks/useDisconnectOnLeave";
import { Loader2, X } from "lucide-react";

interface SshConnectionInfo {
  id: string;
  name: string;
  username: string | null;
  hasStoredCredential: boolean;
}

export type SshConnectionState = "auth" | "connecting" | "connected" | "error";

interface SshTerminalCoreProps {
  connectionId?: string;
  quickSessionId?: string;
  connectionName: string;
  hostname: string;
  defaultUsername?: string | null;
  hasStoredCredential: boolean;
  variant?: "page" | "embedded";
  chromeless?: boolean;
  onClose?: () => void;
  onDisconnect?: () => void;
  onStateChange?: (state: SshConnectionState) => void;
  onWebSocketReady?: (ws: WebSocket) => void;
  onWebSocketClose?: () => void;
  onAuthenticated?: (auth: {
    username: string;
    password?: string;
    privateKey?: string;
  }) => void;
  paneVisible?: boolean;
  sizeContainerRef?: React.RefObject<HTMLElement | null>;
  /** When false, do not steal focus on connect (e.g. embedded SSH beside a desktop). */
  autoFocusOnConnect?: boolean;
}

export interface SshTerminalHandle {
  disconnect: () => void;
  focus: () => void;
  write: (text: string) => void;
}

function useTerminalDimensions(sizeContainerRef?: React.RefObject<HTMLElement | null>) {
  return useCallback(() => {
    const el = sizeContainerRef?.current;
    const width = el?.clientWidth || window.innerWidth;
    const height = el?.clientHeight || window.innerHeight - 120;
    return {
      cols: Math.max(40, Math.floor(width / 8)),
      rows: Math.max(12, Math.floor(height / 18)),
    };
  }, [sizeContainerRef]);
}

export const SshTerminal = forwardRef<SshTerminalHandle, SshTerminalCoreProps>(
  function SshTerminal(
    {
      connectionId,
      quickSessionId,
      connectionName,
      hostname,
      defaultUsername,
      hasStoredCredential,
      variant = "page",
      chromeless = false,
      onClose,
      onDisconnect,
      onStateChange,
      onWebSocketReady,
      onWebSocketClose,
      onAuthenticated,
      paneVisible = true,
      sizeContainerRef,
      autoFocusOnConnect = true,
    },
    ref,
  ) {
    const { ref: termRef, write, resize, focus } = useTerminal();
    const wsRef = useRef<WebSocket | null>(null);
    const connectGenRef = useRef(0);
    const intentionalCloseRef = useRef(false);
    const receivedDataRef = useRef(false);
    const fallbackContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = sizeContainerRef ?? fallbackContainerRef;
    const getDimensions = useTerminalDimensions(containerRef);
    const [state, setState] = useState<SshConnectionState>(
      hasStoredCredential ? "connecting" : "auth",
    );
    const stateRef = useRef<SshConnectionState>(state);
    const [error, setError] = useState("");
    const [username, setUsername] = useState(defaultUsername || "");
    const [password, setPassword] = useState("");
    const [privateKey, setPrivateKey] = useState("");
    const [authMethod, setAuthMethod] = useState<"password" | "privateKey">("password");

    const updateState = useCallback(
      (next: SshConnectionState) => {
        setState(next);
        onStateChange?.(next);
      },
      [onStateChange],
    );

    useEffect(() => {
      stateRef.current = state;
    }, [state]);

    const handleTerminalOutput = useCallback(
      (data: string | Uint8Array) => {
        receivedDataRef.current = true;
        setError("");
        write(data);
      },
      [write],
    );

    const clearTerminal = useCallback(() => {
      write("\x1b[2J\x1b[3J\x1b[H");
    }, [write]);

    const fitTerminal = useCallback(() => {
      const { cols, rows } = getDimensions();
      resize(cols, rows);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    }, [getDimensions, resize]);

    const connect = useCallback(
      (auth?: { username?: string; password?: string; privateKey?: string }) => {
        const gen = ++connectGenRef.current;
        intentionalCloseRef.current = false;
        updateState("connecting");
        setError("");
        receivedDataRef.current = false;
        wsRef.current?.close();
        clearTerminal();

        const resolvedUsername = auth?.username || username || defaultUsername || "";
        if (!connectionId && !quickSessionId) {
          updateState("error");
          setError("Connection target required");
          return;
        }
        const resolvedPassword = auth?.password || password;
        const resolvedPrivateKey = auth?.privateKey || privateKey;

        const ws = new WebSocket(wsUrl("/api/ssh"));
        wsRef.current = ws;
        ws.binaryType = "arraybuffer";

        const markConnected = () => {
          if (gen !== connectGenRef.current) return;
          if (stateRef.current === "connected") return;
          updateState("connected");
          onAuthenticated?.({
            username: resolvedUsername,
            password: resolvedPrivateKey ? undefined : resolvedPassword || undefined,
            privateKey: resolvedPrivateKey || undefined,
          });
          setTimeout(() => {
            fitTerminal();
            if (autoFocusOnConnect) focus();
          }, 0);
        };

        ws.onopen = () => {
          if (gen !== connectGenRef.current) return;
          const { cols, rows } = getDimensions();
          const msg: Record<string, unknown> = {
            cols,
            rows,
            mode: "shell",
          };
          if (quickSessionId) msg.quickSessionId = quickSessionId;
          else msg.connectionId = connectionId;
          if (resolvedUsername) msg.username = resolvedUsername;
          if (resolvedPrivateKey) msg.privateKey = resolvedPrivateKey;
          else if (resolvedPassword) msg.password = resolvedPassword;
          ws.send(JSON.stringify(msg));
          onWebSocketReady?.(ws);
        };

        ws.onmessage = (event: MessageEvent) => {
          if (gen !== connectGenRef.current) return;

          if (event.data instanceof ArrayBuffer) {
            handleTerminalOutput(new Uint8Array(event.data));
            markConnected();
            return;
          }

          if (event.data instanceof Blob) {
            void event.data.arrayBuffer().then((buf) => {
              if (gen !== connectGenRef.current) return;
              handleTerminalOutput(new Uint8Array(buf));
              markConnected();
            });
            return;
          }

          const data = event.data as string;
          if (data.startsWith("{")) {
            try {
              const msg = JSON.parse(data);
              if (msg.type?.startsWith("forward-")) return;
              if (msg.error) {
                if (msg.needsAuth) {
                  updateState("auth");
                  setError("Credentials required");
                } else {
                  setError(msg.error);
                  updateState("error");
                }
                return;
              }
            } catch {
              /* terminal data */
            }
          }

          handleTerminalOutput(data);
          markConnected();
        };

        ws.onclose = () => {
          if (gen !== connectGenRef.current || intentionalCloseRef.current) return;
          onWebSocketClose?.();
          const current = stateRef.current;
          if (current === "connecting" && !receivedDataRef.current) {
            setError((prev) => prev || "Connection failed");
            updateState("error");
          } else if (current === "connected") {
            updateState("error");
            setError("Connection closed");
          }
          wsRef.current = null;
        };

        ws.onerror = () => {
          if (gen !== connectGenRef.current) return;
          setError("WebSocket connection failed");
          updateState("error");
        };
      },
      [
        connectionId,
        quickSessionId,
        defaultUsername,
        getDimensions,
        handleTerminalOutput,
        onAuthenticated,
        onWebSocketClose,
        password,
        privateKey,
        updateState,
        username,
        clearTerminal,
        fitTerminal,
        focus,
        autoFocusOnConnect,
        onWebSocketReady,
      ],
    );

    useEffect(() => {
      const timeout = setTimeout(() => {
        if (!connectionId && !quickSessionId) {
          updateState("error");
          setError("Connection target required");
          return;
        }
        if (hasStoredCredential) {
          connect();
        }
      }, 0);
      return () => {
        clearTimeout(timeout);
        connectGenRef.current += 1;
        intentionalCloseRef.current = true;
        wsRef.current?.close();
        wsRef.current = null;
      };
    }, [connectionId, quickSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      if (!paneVisible || state !== "connected") return;
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => fitTerminal());
      });
      return () => cancelAnimationFrame(id);
    }, [paneVisible, state, fitTerminal]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const observer = new ResizeObserver(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN || stateRef.current === "connected") {
          fitTerminal();
        }
      });
      observer.observe(container);
      return () => observer.disconnect();
    }, [containerRef, fitTerminal]);

    const handleData = useCallback((data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(new TextEncoder().encode(data));
      }
    }, []);

    const disconnect = useCallback(() => {
      intentionalCloseRef.current = true;
      connectGenRef.current += 1;
      wsRef.current?.close();
      wsRef.current = null;
      onWebSocketClose?.();
      onDisconnect?.();
      updateState("auth");
      void fetch(
        quickSessionId
          ? `/api/history/end-quick/${quickSessionId}`
          : `/api/history/end-connection/${connectionId}`,
        { method: "POST", keepalive: true },
      );
      if (variant === "embedded" && onClose) onClose();
    }, [connectionId, quickSessionId, onClose, onDisconnect, onWebSocketClose, updateState, variant]);

    useDisconnectOnLeave(disconnect);

    useImperativeHandle(ref, () => ({
      disconnect,
      focus: () => {
        focus();
      },
      write: (text: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(text);
        }
        write(text);
      },
    }));

    const showAuth = state === "auth" || state === "error";
    const useCardAuth = variant === "page" || chromeless;

    const authForm = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          connect();
        }}
        className={
          useCardAuth
            ? "w-full max-w-md space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6"
            : "w-full space-y-3 p-3"
        }
      >
        {useCardAuth && (
          <h2 className="text-lg font-medium text-zinc-100">SSH Authentication</h2>
        )}
        <div className="space-y-2">
          <Label htmlFor="username" className="text-zinc-300">
            Username
          </Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="border-zinc-700 bg-zinc-800 text-zinc-100"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">Method</Label>
          <select
            value={authMethod}
            onChange={(e) => setAuthMethod(e.target.value as "password" | "privateKey")}
            className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100"
          >
            <option value="password">Password</option>
            <option value="privateKey">Private Key</option>
          </select>
        </div>
        {authMethod === "password" ? (
          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-300">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-zinc-700 bg-zinc-800 text-zinc-100"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="privateKey" className="text-zinc-300">
              Private Key
            </Label>
            <Textarea
              id="privateKey"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              rows={4}
              className="border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100"
            />
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit">{state === "error" ? "Retry" : "Connect"}</Button>
      </form>
    );

    const sessionBody = (
      <div ref={fallbackContainerRef} className="relative h-full min-h-0 bg-zinc-950">
        {state === "connecting" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/80">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        )}

        {showAuth && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
            {authForm}
          </div>
        )}

        <div
          className={`ssh-terminal-host flex h-full min-h-0 flex-col ${showAuth || state === "connecting" ? "invisible" : ""}`}
        >
          {!chromeless && (
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-2 py-1">
              <span className="truncate text-xs text-zinc-500">
                SSH → {hostname}
                {variant === "embedded" ? ` (${connectionName})` : ""}
              </span>
              <Button variant="ghost" size="sm" onClick={disconnect} className="h-7 text-zinc-400">
                {variant === "embedded" && onClose ? <X className="h-4 w-4" /> : "Disconnect"}
              </Button>
            </div>
          )}
          <div
            className="min-h-0 flex-1 overflow-hidden cursor-text"
            onClick={() => {
              focus();
            }}
          >
            <Terminal
              ref={termRef}
              onData={handleData}
              autoResize
              className="h-full w-full"
            />
          </div>
        </div>
      </div>
    );

    if (variant === "embedded") {
      return sessionBody;
    }

    return (
      <SessionLayout title={connectionName} subtitle={`SSH → ${hostname}`}>
        {sessionBody}
      </SessionLayout>
    );
  },
);

export type { SshConnectionInfo };
