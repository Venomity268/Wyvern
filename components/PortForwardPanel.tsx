"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { wsUrl } from "@/lib/utils";
import { Copy, Loader2, Plus, Trash2, X } from "lucide-react";

export interface PortForward {
  id: string;
  remoteHost: string;
  remotePort: number;
  localPort: number;
  listenHost: string;
}

export type ForwardBindAddress = "127.0.0.1" | "0.0.0.0";

const BIND_PREFERENCE_KEY = "wyvern:port-forward-bind";

function readBindPreference(): ForwardBindAddress {
  if (typeof window === "undefined") return "127.0.0.1";
  const stored = window.localStorage.getItem(BIND_PREFERENCE_KEY);
  return stored === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1";
}

function formatBindLabel(listenHost: string): string {
  return listenHost === "0.0.0.0" ? "0.0.0.0 (all interfaces)" : "127.0.0.1 (localhost)";
}

interface PortForwardPanelProps {
  connectionId: string;
  connectionName: string;
  defaultUsername?: string | null;
  hasStoredCredential: boolean;
  remoteHostname: string;
  mode?: "standalone" | "multiplexed";
  shellWebSocket?: WebSocket | null;
  tunnelWebSocket?: WebSocket | null;
  forwards?: PortForward[];
  onForwardsChange?: (forwards: PortForward[]) => void;
  /** When false, skip WS listeners (state may still be passed from parent). */
  isActive?: boolean;
  /** Keep standalone tunnel open when the panel unmounts. */
  persistTunnel?: boolean;
  onTunnelWebSocketChange?: (ws: WebSocket | null) => void;
  onClose?: () => void;
}

export function PortForwardPanel({
  connectionId,
  connectionName,
  defaultUsername,
  hasStoredCredential,
  remoteHostname,
  mode = "standalone",
  shellWebSocket = null,
  tunnelWebSocket = null,
  forwards: controlledForwards,
  onForwardsChange,
  isActive = true,
  persistTunnel = false,
  onTunnelWebSocketChange,
  onClose,
}: PortForwardPanelProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState(defaultUsername || "");
  const [password, setPassword] = useState("");
  const [needsAuth, setNeedsAuth] = useState(!hasStoredCredential);
  const [bindAddress, setBindAddress] = useState<ForwardBindAddress>(readBindPreference);
  const [internalForwards, setInternalForwards] = useState<PortForward[]>([]);
  const [remoteHost, setRemoteHost] = useState("127.0.0.1");
  const [remotePort, setRemotePort] = useState("");
  const [localPort, setLocalPort] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const forwards = controlledForwards ?? internalForwards;

  const updateForwards = useCallback(
    (updater: PortForward[] | ((prev: PortForward[]) => PortForward[])) => {
      const next =
        typeof updater === "function" ? updater(forwards) : updater;
      if (onForwardsChange) onForwardsChange(next);
      else setInternalForwards(next);
    },
    [forwards, onForwardsChange],
  );

  const activeWs =
    mode === "multiplexed" ? shellWebSocket : (tunnelWebSocket ?? wsRef.current);

  const handleForwardMessage = useCallback(
    (data: string) => {
      if (!data.startsWith("{")) return;
      try {
        const msg = JSON.parse(data) as Record<string, unknown>;
        if (msg.type === "ready") {
          setReady(true);
          setConnecting(false);
          setNeedsAuth(false);
        }
        if (msg.type === "forward-list") {
          const list = Array.isArray(msg.forwards) ? msg.forwards : [];
          updateForwards(
            list.map((entry) => {
              const forward = entry as Record<string, unknown>;
              return {
                id: String(forward.id),
                remoteHost: String(forward.remoteHost),
                remotePort: Number(forward.remotePort),
                localPort: Number(forward.localPort),
                listenHost: String(forward.listenHost || "127.0.0.1"),
              };
            }),
          );
        }
        if (msg.type === "forward-ready") {
          const id = String(msg.id);
          updateForwards((prev) => {
            if (prev.some((forward) => forward.id === id)) return prev;
            return [
              ...prev,
              {
                id,
                remoteHost: String(msg.remoteHost),
                remotePort: Number(msg.remotePort),
                localPort: Number(msg.localPort),
                listenHost: String(msg.listenHost || bindAddress),
              },
            ];
          });
        }
        if (msg.type === "forward-removed") {
          updateForwards((prev) => prev.filter((f) => f.id !== msg.id));
        }
        if (msg.type === "forward-error") {
          setError(String(msg.error || "Forward failed"));
        }
      } catch {
        /* ignore */
      }
    },
    [bindAddress, updateForwards],
  );

  useEffect(() => {
    if (mode !== "multiplexed" || !isActive) return;

    const timeout = setTimeout(() => {
      if (shellWebSocket?.readyState === WebSocket.OPEN) {
        setReady(true);
        setConnecting(false);
        setNeedsAuth(false);
      } else {
        setReady(false);
      }
    }, 0);

    if (!shellWebSocket) {
      return () => clearTimeout(timeout);
    }

    const handler = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      handleForwardMessage(event.data);
    };

    shellWebSocket.addEventListener("message", handler);
    return () => {
      clearTimeout(timeout);
      shellWebSocket.removeEventListener("message", handler);
    };
  }, [handleForwardMessage, isActive, mode, shellWebSocket]);

  useEffect(() => {
    if (mode !== "standalone" || !tunnelWebSocket) return;

    wsRef.current = tunnelWebSocket;
    if (tunnelWebSocket.readyState === WebSocket.OPEN) {
      setReady(true);
      setConnecting(false);
      setNeedsAuth(false);
    } else {
      setReady(false);
    }

    const handler = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      handleForwardMessage(event.data);
    };

    tunnelWebSocket.addEventListener("message", handler);
    return () => tunnelWebSocket.removeEventListener("message", handler);
  }, [handleForwardMessage, mode, tunnelWebSocket]);

  useEffect(() => {
    if (!isActive || !ready) return;
    const ws =
      mode === "multiplexed" ? shellWebSocket : (tunnelWebSocket ?? wsRef.current);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "forward-list" }));
  }, [isActive, mode, ready, shellWebSocket, tunnelWebSocket]);

  const connectTunnel = useCallback(
    (auth?: { username?: string; password?: string }) => {
      if (mode === "multiplexed") return;
      setConnecting(true);
      setError("");
      wsRef.current?.close();

      const ws = new WebSocket(wsUrl("/api/ssh"));
      wsRef.current = ws;
      onTunnelWebSocketChange?.(ws);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            connectionId,
            mode: "tunnel",
            username: auth?.username || username || undefined,
            password: auth?.password ?? (password || undefined),
          }),
        );
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        handleForwardMessage(event.data);
        try {
          const msg = JSON.parse(event.data);
          if (msg.error) {
            if (msg.needsAuth) {
              setNeedsAuth(true);
              setConnecting(false);
              setError(String(msg.error));
            } else {
              setError(String(msg.error));
              setConnecting(false);
            }
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        setReady(false);
        setConnecting(false);
        wsRef.current = null;
        onTunnelWebSocketChange?.(null);
      };

      ws.onerror = () => {
        setError("Tunnel connection failed");
        setConnecting(false);
      };
    },
    [connectionId, handleForwardMessage, mode, onTunnelWebSocketChange, password, username],
  );

  useEffect(() => {
    return () => {
      if (mode === "standalone" && !persistTunnel) {
        wsRef.current?.close();
        wsRef.current = null;
      }
    };
  }, [mode, persistTunnel]);

  const addForward = useCallback(() => {
    const ws = activeWs;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError(mode === "multiplexed" ? "Connect the SSH shell first" : "Tunnel not connected");
      return;
    }
    const port = parseInt(remotePort, 10);
    if (!remoteHost || Number.isNaN(port)) {
      setError("Enter a valid remote host and port");
      return;
    }
    setError("");
    const payload: Record<string, unknown> = {
      type: "forward-add",
      remoteHost,
      remotePort: port,
      listenHost: bindAddress,
    };
    const preferred = parseInt(localPort, 10);
    if (!Number.isNaN(preferred) && preferred > 0) {
      payload.localPort = preferred;
    }
    ws.send(JSON.stringify(payload));
    setLocalPort("");
  }, [activeWs, bindAddress, localPort, mode, remoteHost, remotePort]);

  const handleBindAddressChange = useCallback((value: ForwardBindAddress) => {
    setBindAddress(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BIND_PREFERENCE_KEY, value);
    }
  }, []);

  const removeForward = useCallback(
    (id: string) => {
      const ws = activeWs;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "forward-remove", id }));
    },
    [activeWs],
  );

  const copyAddress = useCallback(async (forward: PortForward) => {
    const text = `${forward.listenHost}:${forward.localPort}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(forward.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  }, []);

  const header = (
    <div className="mb-3 flex items-center justify-between gap-2">
      <p className="text-sm font-medium text-zinc-100">Port forwarding</p>
      {onClose && (
        <Button variant="ghost" size="sm" className="h-7 text-zinc-400" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  if (mode === "standalone" && needsAuth && !ready) {
    return (
      <div>
        {header}
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">
            SSH tunnel via <strong className="text-zinc-200">{connectionName}</strong> to expose
            ports on {remoteHostname}.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-zinc-400">Username</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border-zinc-700 bg-zinc-800 text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-400">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-zinc-700 bg-zinc-800 text-zinc-100"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button size="sm" onClick={() => connectTunnel()} disabled={connecting}>
            {connecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Connect tunnel
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "standalone" && connecting && !ready) {
    return (
      <div>
        {header}
        <div className="flex items-center gap-2 py-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening SSH tunnel…
        </div>
      </div>
    );
  }

  if (mode === "multiplexed" && !shellWebSocket) {
    return (
      <div>
        {header}
        <p className="text-sm text-zinc-400">Connect the SSH session to manage port forwards.</p>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="space-y-3">
        <p className="text-xs text-zinc-400">
          {mode === "multiplexed" ? (
            <>
              Forwards use your active shell session via{" "}
              <strong className="text-zinc-200">{connectionName}</strong>.
            </>
          ) : (
            <>
              Expose remote ports on this Wyvern host via{" "}
              <strong className="text-zinc-200">{connectionName}</strong>.
            </>
          )}
        </p>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2 lg:col-span-2">
            <Label className="text-zinc-400">Remote host</Label>
            <Input
              value={remoteHost}
              onChange={(e) => setRemoteHost(e.target.value)}
              placeholder="127.0.0.1"
              className="border-zinc-700 bg-zinc-800 text-zinc-100"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-zinc-400">Remote port</Label>
            <Input
              value={remotePort}
              onChange={(e) => setRemotePort(e.target.value)}
              placeholder="8080"
              className="border-zinc-700 bg-zinc-800 text-zinc-100"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-zinc-400">Local port (optional)</Label>
            <Input
              value={localPort}
              onChange={(e) => setLocalPort(e.target.value)}
              placeholder="auto"
              className="border-zinc-700 bg-zinc-800 text-zinc-100"
            />
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-4">
            <Label className="text-zinc-400">Listen on</Label>
            <select
              value={bindAddress}
              onChange={(e) => handleBindAddressChange(e.target.value as ForwardBindAddress)}
              className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100"
            >
              <option value="127.0.0.1">Localhost (127.0.0.1)</option>
              <option value="0.0.0.0">All interfaces (0.0.0.0)</option>
            </select>
            <p className="text-xs text-zinc-500">
              {bindAddress === "127.0.0.1"
                ? "Only reachable from this machine."
                : "Reachable from other devices on the network using this host's IP address."}
            </p>
          </div>
        </div>

        {mode === "standalone" && !ready ? (
          <Button size="sm" onClick={() => connectTunnel()} disabled={connecting}>
            {connecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Connect tunnel
          </Button>
        ) : (
          <Button size="sm" onClick={addForward} disabled={!ready}>
            <Plus className="mr-1 h-4 w-4" />
            Expose port
          </Button>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {forwards.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500">Active forwards</p>
            <ul className="divide-y divide-zinc-800 rounded-md border border-zinc-800">
              {forwards.map((forward) => (
                <li
                  key={forward.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="font-mono text-zinc-200">
                    {formatBindLabel(forward.listenHost)}:{forward.localPort} → {forward.remoteHost}:
                    {forward.remotePort}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-zinc-400"
                      onClick={() => copyAddress(forward)}
                      title="Copy local address"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedId === forward.id ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-red-400"
                      onClick={() => removeForward(forward.id)}
                      title="Remove forward"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
