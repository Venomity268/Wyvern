"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { wsUrl } from "@/lib/utils";
import { Copy, Loader2, Plus, Trash2, X } from "lucide-react";

interface PortForward {
  id: string;
  remoteHost: string;
  remotePort: number;
  localPort: number;
  listenHost: string;
}

interface PortForwardPanelProps {
  connectionId: string;
  connectionName: string;
  defaultUsername?: string | null;
  hasStoredCredential: boolean;
  remoteHostname: string;
  mode?: "standalone" | "multiplexed";
  shellWebSocket?: WebSocket | null;
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
  onClose,
}: PortForwardPanelProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState(defaultUsername || "");
  const [password, setPassword] = useState("");
  const [needsAuth, setNeedsAuth] = useState(!hasStoredCredential);
  const [listenHost, setListenHost] = useState("127.0.0.1");
  const [forwards, setForwards] = useState<PortForward[]>([]);
  const [remoteHost, setRemoteHost] = useState("127.0.0.1");
  const [remotePort, setRemotePort] = useState("");
  const [localPort, setLocalPort] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeWs = mode === "multiplexed" ? shellWebSocket : wsRef.current;

  const handleForwardMessage = useCallback((data: string) => {
    if (!data.startsWith("{")) return;
    try {
      const msg = JSON.parse(data) as Record<string, unknown>;
      if (msg.type === "ready") {
        setListenHost(String(msg.listenHost || "127.0.0.1"));
        setReady(true);
        setConnecting(false);
        setNeedsAuth(false);
      }
      if (msg.type === "forward-ready") {
        setForwards((prev) => [
          ...prev,
          {
            id: String(msg.id),
            remoteHost: String(msg.remoteHost),
            remotePort: Number(msg.remotePort),
            localPort: Number(msg.localPort),
            listenHost: String(msg.listenHost || listenHost),
          },
        ]);
      }
      if (msg.type === "forward-removed") {
        setForwards((prev) => prev.filter((f) => f.id !== msg.id));
      }
      if (msg.type === "forward-error") {
        setError(String(msg.error || "Forward failed"));
      }
    } catch {
      /* ignore */
    }
  }, [listenHost]);

  useEffect(() => {
    if (mode !== "multiplexed") return;

    if (shellWebSocket?.readyState === WebSocket.OPEN) {
      setReady(true);
      setConnecting(false);
      setNeedsAuth(false);
    } else {
      setReady(false);
    }

    if (!shellWebSocket) return;

    const handler = (event: MessageEvent) => {
      const data =
        typeof event.data === "string"
          ? event.data
          : new TextDecoder().decode(event.data as ArrayBuffer);
      handleForwardMessage(data);
    };

    shellWebSocket.addEventListener("message", handler);
    return () => shellWebSocket.removeEventListener("message", handler);
  }, [handleForwardMessage, mode, shellWebSocket]);

  const connectTunnel = useCallback(
    (auth?: { username?: string; password?: string }) => {
      if (mode === "multiplexed") return;
      setConnecting(true);
      setError("");
      wsRef.current?.close();

      const ws = new WebSocket(wsUrl("/api/ssh"));
      wsRef.current = ws;

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
        handleForwardMessage(event.data as string);
        const data = event.data as string;
        if (data.startsWith("{")) {
          try {
            const msg = JSON.parse(data);
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
        }
      };

      ws.onclose = () => {
        setReady(false);
        setConnecting(false);
        wsRef.current = null;
      };

      ws.onerror = () => {
        setError("Tunnel connection failed");
        setConnecting(false);
      };
    },
    [connectionId, handleForwardMessage, mode, password, username],
  );

  useEffect(() => {
    return () => {
      if (mode === "standalone") wsRef.current?.close();
    };
  }, [mode]);

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
    };
    const preferred = parseInt(localPort, 10);
    if (!Number.isNaN(preferred) && preferred > 0) {
      payload.localPort = preferred;
    }
    ws.send(JSON.stringify(payload));
    setLocalPort("");
  }, [activeWs, localPort, mode, remoteHost, remotePort]);

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
              Forwards listen on <strong className="text-zinc-200">{listenHost}</strong> through{" "}
              <strong className="text-zinc-200">{connectionName}</strong>.
            </>
          )}
        </p>

        <div className="grid gap-2 sm:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
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
                    {forward.listenHost}:{forward.localPort} → {forward.remoteHost}:
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
