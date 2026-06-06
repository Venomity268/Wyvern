"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import { createGhosttyCore } from "@/lib/ghostty/shared-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SessionLayout } from "@/components/SessionLayout";
import { wsUrl } from "@/lib/utils";
import { useDisconnectOnLeave } from "@/lib/hooks/useDisconnectOnLeave";
import { usePreventBackspaceNavigation } from "@/lib/hooks/usePreventBackspaceNavigation";
import { useTerminalCopyPaste } from "@/lib/hooks/useTerminalCopyPaste";
import { installAltScreenRenderPatch } from "@/lib/terminal/alt-screen";
import { attachTerminalWheel } from "@/lib/terminal/wheel";
import { afterTerminalDisplaySync } from "@/lib/terminal/display-sync";
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
  onResize?: (cols: number, rows: number) => void;
  /** When true, notify the server that the connection session ended (page disconnect). */
  reportSessionEnd?: boolean;
  paneVisible?: boolean;
  sizeContainerRef?: React.RefObject<HTMLElement | null>;
  /** When false, do not steal focus on connect (e.g. embedded SSH beside a desktop). */
  autoFocusOnConnect?: boolean;
  execCommand?: string;
}

export interface SshTerminalHandle {
  disconnect: () => void;
  /** Close the WebSocket without ending the server-side session record. */
  closeSocket: () => void;
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

const SshTerminalComponent = forwardRef<SshTerminalHandle, SshTerminalCoreProps>(
  function SshTerminal(
    {
      connectionId,
      quickSessionId,
      connectionName,
      hostname,
      defaultUsername,
      hasStoredCredential,
      execCommand,
      variant = "page",
      chromeless = false,
      onClose,
      onDisconnect,
      onStateChange,
      onWebSocketReady,
      onWebSocketClose,
      onAuthenticated,
      onResize,
      paneVisible = true,
      reportSessionEnd = variant === "page",
      sizeContainerRef,
      autoFocusOnConnect = true,
    },
    ref,
  ) {
    const { ref: termRef, write, resize, focus } = useTerminal();
    const wtermElRef = useRef<HTMLElement | null>(null);
    const wheelCleanupRef = useRef<(() => void) | null>(null);
    const wasAltScreenRef = useRef(false);

    const sendTerminalData = useCallback((data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(new TextEncoder().encode(data));
      }
    }, []);

    const syncDisplay = useCallback(() => {
      afterTerminalDisplaySync(
        wtermElRef.current,
        termRef.current?.instance ?? null,
        termRef.current?.instance?.bridge ?? null,
        wasAltScreenRef,
      );
    }, [termRef]);
    const [ghosttyCore, setGhosttyCore] = useState<Awaited<ReturnType<typeof createGhosttyCore>> | null>(null);
    const [coreLoading, setCoreLoading] = useState(true);
    const [coreError, setCoreError] = useState<string | null>(null);

    useEffect(() => {
      let active = true;
      setCoreLoading(true);
      setCoreError(null);
      createGhosttyCore()
        .then((core) => {
          if (active) {
            setGhosttyCore(core);
            setCoreLoading(false);
          }
        })
        .catch((err) => {
          console.error("Failed to load GhosttyCore:", err);
          if (active) {
            setCoreError(err instanceof Error ? err.message : "Failed to load terminal core");
            setCoreLoading(false);
          }
        });
      return () => {
        active = false;
      };
    }, []);

    const wsRef = useRef<WebSocket | null>(null);
    const connectGenRef = useRef(0);
    const intentionalCloseRef = useRef(false);
    const receivedDataRef = useRef(false);
    const fallbackContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = sizeContainerRef ?? fallbackContainerRef;
    const getDimensions = useTerminalDimensions(containerRef);
    const dimensionsRef = useRef(getDimensions());
    const resizeNotifyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        syncDisplay();
      },
      [write, syncDisplay],
    );

    const handleTerminalReady = useCallback(() => {
      const instance = termRef.current?.instance;
      const el = instance?.element ?? null;
      wtermElRef.current = el;

      wheelCleanupRef.current?.();
      wheelCleanupRef.current = null;
      if (el) {
        installAltScreenRenderPatch(instance, el);
        wheelCleanupRef.current = attachTerminalWheel(
          el,
          () => termRef.current?.instance?.bridge ?? null,
          sendTerminalData,
        );
      }

      syncDisplay();
    }, [termRef, sendTerminalData, syncDisplay]);

    const clearTerminal = useCallback(() => {
      write("\x1b[2J\x1b[3J\x1b[H");
    }, [write]);

    const handleResize = useCallback((cols: number, rows: number) => {
      dimensionsRef.current = { cols, rows };
      onResize?.(cols, rows);
      syncDisplay();
      if (resizeNotifyRef.current) clearTimeout(resizeNotifyRef.current);
      resizeNotifyRef.current = setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      }, 150);
    }, [onResize, syncDisplay]);

    useEffect(() => {
      return () => {
        if (resizeNotifyRef.current) clearTimeout(resizeNotifyRef.current);
        wheelCleanupRef.current?.();
        wheelCleanupRef.current = null;
      };
    }, []);

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
            if (autoFocusOnConnect) focus();
          }, 50);
        };

        ws.onopen = () => {
          if (gen !== connectGenRef.current) return;
          const { cols, rows } = dimensionsRef.current;
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
          if (execCommand) msg.execCommand = execCommand;
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
        focus,
        autoFocusOnConnect,
        onWebSocketReady,
        execCommand,
      ],
    );

    useEffect(() => {
      if (!paneVisible) return;

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
    }, [connectionId, quickSessionId, paneVisible]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleData = useCallback((data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(new TextEncoder().encode(data));
      }
    }, []);

    const closeSocket = useCallback(() => {
      intentionalCloseRef.current = true;
      connectGenRef.current += 1;
      wsRef.current?.close();
      wsRef.current = null;
      onWebSocketClose?.();
    }, [onWebSocketClose]);

    const disconnect = useCallback(() => {
      closeSocket();
      onDisconnect?.();
      updateState("auth");
      if (reportSessionEnd) {
        if (quickSessionId) {
          void fetch(`/api/history/end-quick/${quickSessionId}`, {
            method: "POST",
            keepalive: true,
          });
        } else if (connectionId) {
          void fetch(`/api/history/end-connection/${connectionId}`, {
            method: "POST",
            keepalive: true,
          });
        }
      }
      if (variant === "embedded" && onClose) onClose();
    }, [closeSocket, connectionId, quickSessionId, onClose, onDisconnect, reportSessionEnd, updateState, variant]);

    useDisconnectOnLeave(variant === "page" ? disconnect : () => {});

    usePreventBackspaceNavigation(state === "connected");

    const sendTerminalInput = useCallback((text: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(new TextEncoder().encode(text));
      }
    }, []);

    useTerminalCopyPaste(state === "connected", sendTerminalInput);

    useImperativeHandle(ref, () => ({
      disconnect,
      closeSocket,
      focus: () => {
        focus();
      },
      write: (text: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(text);
        }
        write(text);
        syncDisplay();
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

    const coreReady = ghosttyCore !== null;

    const sessionBody = (
      <div ref={fallbackContainerRef} className="relative flex h-full min-h-0 w-full flex-col bg-zinc-950">
        {(coreLoading || !coreReady) && !coreError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950 gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
            <span className="text-[10px] text-zinc-500 font-mono">Loading Ghostty Core...</span>
          </div>
        )}

        {coreError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950 gap-2 p-4 text-center">
            <p className="text-sm text-red-400">Failed to load terminal core</p>
            <p className="text-xs text-zinc-500 font-mono">{coreError}</p>
          </div>
        )}

        {state === "connecting" && coreReady && (
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
          className={`ssh-terminal-host relative flex min-h-0 flex-1 flex-col w-full h-full select-text ${showAuth ? "hidden" : ""}`}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            if (stateRef.current === "connected") focus();
          }}
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
          <div className="relative flex min-h-0 flex-1 flex-col w-full h-full">
            {coreReady ? (
              <Terminal
                key="wterm"
                ref={termRef}
                core={ghosttyCore}
                onData={handleData}
                onResize={handleResize}
                autoResize
                cursorBlink
                onReady={handleTerminalReady}
                onError={(err: unknown) => {
                  setCoreError(err instanceof Error ? err.message : String(err));
                }}
                className="h-full w-full min-h-0"
              />
            ) : null}
          </div>
        </div>
      </div>
    );

    if (variant === "embedded") {
      return sessionBody;
    }

    return (
      <SessionLayout
        title={connectionName}
        protocol="ssh"
        endpoint={hostname}
        status={state === "connected" ? "connected" : state === "connecting" ? "connecting" : "disconnected"}
      >
        {sessionBody}
      </SessionLayout>
    );
  },
);

const SshTerminalMemo = memo(
  SshTerminalComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.connectionId === nextProps.connectionId &&
      prevProps.quickSessionId === nextProps.quickSessionId &&
      prevProps.connectionName === nextProps.connectionName &&
      prevProps.hostname === nextProps.hostname &&
      prevProps.defaultUsername === nextProps.defaultUsername &&
      prevProps.hasStoredCredential === nextProps.hasStoredCredential &&
      prevProps.execCommand === nextProps.execCommand &&
      prevProps.variant === nextProps.variant &&
      prevProps.chromeless === nextProps.chromeless &&
      prevProps.paneVisible === nextProps.paneVisible &&
      prevProps.reportSessionEnd === nextProps.reportSessionEnd &&
      prevProps.autoFocusOnConnect === nextProps.autoFocusOnConnect
    );
  }
);

export const SshTerminal = SshTerminalMemo;

export type { SshConnectionInfo };
