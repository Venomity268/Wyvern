"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultPort } from "@/lib/utils";
import type { ConnectionProtocol } from "@/lib/protocols";
import { PROTOCOL_LABELS } from "@/lib/protocols";
import { Loader2, Zap } from "lucide-react";

const PROTOCOLS: ConnectionProtocol[] = ["ssh", "vnc", "rdp"];

export function QuickConnectForm() {
  const router = useRouter();
  const [protocol, setProtocol] = useState<ConnectionProtocol>("ssh");
  const [hostname, setHostname] = useState("");
  const [port, setPort] = useState(String(defaultPort("ssh")));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [macAddress, setMacAddress] = useState("");
  const [authMethod, setAuthMethod] = useState<"password" | "privateKey">("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function onProtocolChange(next: ConnectionProtocol) {
    setProtocol(next);
    setPort(String(defaultPort(next)));
    if (next !== "ssh") setAuthMethod("password");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/quick-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol,
          hostname,
          port: parseInt(port, 10) || defaultPort(protocol),
          username: username || undefined,
          password: authMethod === "password" ? password : undefined,
          privateKey: authMethod === "privateKey" ? privateKey : undefined,
          macAddress: macAddress.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to connect");
        return;
      }

      if ((protocol === "vnc" || protocol === "rdp") && macAddress.trim()) {
        const wakeRes = await fetch(`/api/quick-connect/${data.id}/wake`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wait: true }),
        });
        const wakeData = await wakeRes.json();
        if (!wakeRes.ok) {
          setError(wakeData.error || "Wake failed");
          return;
        }
        if (!wakeData.ready) {
          setError("Host did not wake — on Ubuntu run: sudo ethtool -s eth0 wol g");
          return;
        }
      }

      router.push(`/connect/${data.id}`);
    } catch {
      setError("Failed to start session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-lg border-zinc-800 bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-amber-400" />
          Quick connect
        </CardTitle>
        <p className="text-sm text-muted">
          Connect immediately without saving. You can save the connection later from the session.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Protocol</Label>
            <div className="flex flex-wrap gap-2">
              {PROTOCOLS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={protocol === p ? "secondary" : "outline"}
                  onClick={() => onProtocolChange(p)}
                  title={PROTOCOL_LABELS[p].hint}
                >
                  {PROTOCOL_LABELS[p].label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-zinc-500">{PROTOCOL_LABELS[protocol].hint}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
            <div className="space-y-1">
              <Label htmlFor="qc-host">Host</Label>
              <Input
                id="qc-host"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="192.168.1.10 or host.example.com"
                required
                className="border-zinc-700 bg-zinc-900"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="qc-port">Port</Label>
              <Input
                id="qc-port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                required
                className="border-zinc-700 bg-zinc-900"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="qc-user">
              Username
              {protocol === "vnc"
                ? " (optional on some VNC servers)"
                : protocol === "ssh"
                  ? " (Ubuntu login name)"
                  : ""}
            </Label>
            <Input
              id="qc-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required={protocol !== "vnc"}
              className="border-zinc-700 bg-zinc-900"
            />
          </div>

          {protocol === "ssh" && (
            <div className="space-y-1">
              <Label>Authentication</Label>
              <select
                value={authMethod}
                onChange={(e) => setAuthMethod(e.target.value as "password" | "privateKey")}
                className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm"
              >
                <option value="password">Password</option>
                <option value="privateKey">Private key</option>
              </select>
            </div>
          )}

          {protocol === "ssh" && authMethod === "privateKey" ? (
            <div className="space-y-1">
              <Label htmlFor="qc-key">Private key</Label>
              <Textarea
                id="qc-key"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                rows={4}
                required
                className="border-zinc-700 bg-zinc-900 font-mono text-xs"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="qc-pass">Password</Label>
              <Input
                id="qc-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-zinc-700 bg-zinc-900"
              />
            </div>
          )}

          {(protocol === "vnc" || protocol === "rdp") && (
            <div className="space-y-1">
              <Label htmlFor="qc-mac">MAC address (optional, for wake-on-LAN)</Label>
              <Input
                id="qc-mac"
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                placeholder="aa:bb:cc:dd:ee:ff"
                className="border-zinc-700 bg-zinc-900 font-mono text-sm"
              />
              <p className="text-xs text-zinc-500">
                Sends a wake packet before connecting if the remote machine is asleep.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Connect
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
