"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultPort } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ConnectionProtocol } from "@/lib/protocols";
import { PROTOCOL_LABELS } from "@/lib/protocols";
import type { ConnectionMethodInput } from "@/lib/db/connection-methods";

export type { ConnectionMethodInput };

export interface ConnectionFormData {
  name: string;
  hostname: string;
  methods: ConnectionMethodInput[];
  username?: string | null;
  workspace_id?: string;
  folder_id?: string | null;
  tags?: string | null;
  mac_address?: string | null;
  wol_broadcast?: string | null;
}

export interface FolderOption {
  id: string;
  name: string;
  parent_id: string | null;
}

const PROTOCOLS: ConnectionProtocol[] = ["ssh", "vnc", "rdp"];

interface CredentialOption {
  id: string;
  label: string;
}

interface WorkspaceOption {
  id: string;
  name: string;
}

interface ConnectionFormProps {
  workspaceId: string;
  workspaces?: WorkspaceOption[];
  credentials: CredentialOption[];
  folders?: FolderOption[];
  initial?: Partial<ConnectionFormData> & {
    id?: string;
    methods?: ConnectionMethodInput[];
    protocol?: ConnectionProtocol;
    port?: number;
    credential_id?: string | null;
    folder_id?: string | null;
    tags?: string | null;
    mac_address?: string | null;
    wol_broadcast?: string | null;
  };
  onSubmit: (data: ConnectionFormData) => Promise<void>;
  onCancel?: () => void;
}

function defaultMethods(initial?: ConnectionFormProps["initial"]): ConnectionMethodInput[] {
  if (initial?.methods?.length) return initial.methods;
  if (initial?.protocol && initial.port) {
    return [
      {
        protocol: initial.protocol,
        port: initial.port,
        credential_id: initial.credential_id ?? null,
      },
    ];
  }
  return [{ protocol: "ssh", port: defaultPort("ssh"), credential_id: null }];
}

function initialCredentialForProtocol(
  protocol: ConnectionProtocol,
  initialMethods: ConnectionMethodInput[],
  legacyCredentialId?: string | null,
): string {
  return (
    initialMethods.find((m) => m.protocol === protocol)?.credential_id ??
    legacyCredentialId ??
    ""
  );
}

export function ConnectionForm({
  workspaceId,
  workspaces = [],
  credentials,
  folders = [],
  initial,
  onSubmit,
  onCancel,
}: ConnectionFormProps) {
  const initialMethods = defaultMethods(initial);
  const [name, setName] = useState(initial?.name || "");
  const [hostname, setHostname] = useState(initial?.hostname || "");
  const [folderId, setFolderId] = useState<string | null>(initial?.folder_id || null);
  const [tags, setTags] = useState(initial?.tags || "");
  const [enabled, setEnabled] = useState<Record<ConnectionProtocol, boolean>>({
    ssh: initialMethods.some((m) => m.protocol === "ssh"),
    vnc: initialMethods.some((m) => m.protocol === "vnc"),
    rdp: initialMethods.some((m) => m.protocol === "rdp"),
  });
  const [ports, setPorts] = useState<Record<ConnectionProtocol, string>>({
    ssh: String(initialMethods.find((m) => m.protocol === "ssh")?.port ?? defaultPort("ssh")),
    vnc: String(initialMethods.find((m) => m.protocol === "vnc")?.port ?? defaultPort("vnc")),
    rdp: String(initialMethods.find((m) => m.protocol === "rdp")?.port ?? defaultPort("rdp")),
  });
  const [credentialIds, setCredentialIds] = useState<Record<ConnectionProtocol, string>>({
    ssh: initialCredentialForProtocol("ssh", initialMethods, initial?.credential_id),
    vnc: initialCredentialForProtocol("vnc", initialMethods, initial?.credential_id),
    rdp: initialCredentialForProtocol("rdp", initialMethods, initial?.credential_id),
  });
  const [username, setUsername] = useState(initial?.username || "");
  const [macAddress, setMacAddress] = useState(initial?.mac_address || "");
  const [wolBroadcast, setWolBroadcast] = useState(initial?.wol_broadcast || "");
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(workspaceId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // SSH Key Deployment States
  const [bastionPubKey, setBastionPubKey] = useState("");
  const [deployingKey, setDeployingKey] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [deployPassword, setDeployPassword] = useState("");
  const [showDeployPassword, setShowDeployPassword] = useState(false);

  useEffect(() => {
    if (initial?.id) {
      void (async () => {
        try {
          const res = await fetch(`/api/connections/${initial.id}/deploy-key`);
          if (res.ok) {
            const data = await res.json();
            setBastionPubKey(data.publicKey || "");
          }
        } catch {}
      })();
    }
  }, [initial?.id]);

  async function handleDeployKey() {
    setDeployingKey(true);
    setDeployError("");
    setDeploySuccess(false);
    try {
      const res = await fetch(`/api/connections/${initial!.id}/deploy-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deployPassword || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Deployment failed");
      }
      setDeploySuccess(true);
      setDeployPassword("");
      setShowDeployPassword(false);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Deployment failed");
      setShowDeployPassword(true);
    } finally {
      setDeployingKey(false);
    }
  }

  function getFolderPath(fid: string | null, list: FolderOption[]): string {
    if (!fid) return "";
    const f = list.find((item) => item.id === fid);
    if (!f) return "";
    const parentPath = getFolderPath(f.parent_id, list);
    return parentPath ? `${parentPath} / ${f.name}` : f.name;
  }

  function toggleProtocol(p: ConnectionProtocol) {
    setEnabled((prev) => ({ ...prev, [p]: !prev[p] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const methods: ConnectionMethodInput[] = PROTOCOLS.filter((p) => enabled[p]).map((p) => ({
      protocol: p,
      port: parseInt(ports[p], 10) || defaultPort(p),
      credential_id: credentialIds[p] || null,
    }));

    if (methods.length === 0) {
      setError("Enable at least one access method (SSH, VNC, or RDP)");
      setLoading(false);
      return;
    }

    try {
      await onSubmit({
        name,
        hostname,
        methods,
        username,
        workspace_id: targetWorkspaceId,
        folder_id: folderId,
        tags: tags.trim() ? tags.split(",").map((t) => t.trim()).filter(Boolean).join(",") : null,
        mac_address: macAddress.trim() || null,
        wol_broadcast: wolBroadcast.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  const needsUsername = enabled.ssh || enabled.rdp;
  const supportsWake = enabled.vnc || enabled.rdp;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initial ? "Edit Connection" : "New Connection"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {workspaces.length > 1 && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="workspace">Workspace</Label>
                <select
                  id="workspace"
                  value={targetWorkspaceId}
                  onChange={(e) => setTargetWorkspaceId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100"
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hostname">Hostname</Label>
              <Input id="hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder">Folder</Label>
              <select
                id="folder"
                value={folderId || ""}
                onChange={(e) => setFolderId(e.target.value || null)}
                className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100"
              >
                <option value="">(Root / None)</option>
                {[...folders]
                  .sort((a, b) => getFolderPath(a.id, folders).localeCompare(getFolderPath(b.id, folders)))
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {getFolderPath(f.id, folders)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="production, staging, database"
              />
              <p className="text-xs text-zinc-500">Comma-separated tags (e.g. web, production)</p>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <Label>Access methods</Label>
            <p className="text-xs text-zinc-500">
              Enable each way you connect to this host, set its port, and optionally assign a saved credential.
            </p>
            <div className="space-y-4">
              {PROTOCOLS.map((p) => (
                <div
                  key={p}
                  className={`space-y-2 rounded-md border p-3 ${enabled[p] ? "border-zinc-700" : "border-transparent opacity-60"}`}
                >
                  <label className="flex flex-col gap-0.5 text-sm font-medium text-zinc-200 sm:flex-row sm:items-center sm:gap-2">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={enabled[p]}
                        onChange={() => toggleProtocol(p)}
                        className="rounded border-zinc-600"
                      />
                      {PROTOCOL_LABELS[p].label}
                    </span>
                    <span className="text-xs font-normal text-zinc-500 sm:ml-6">
                      {PROTOCOL_LABELS[p].hint}
                    </span>
                  </label>
                  {enabled[p] && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`${p}-port`} className="text-xs text-zinc-400">
                          Port
                        </Label>
                        <Input
                          id={`${p}-port`}
                          type="number"
                          value={ports[p]}
                          onChange={(e) => setPorts((prev) => ({ ...prev, [p]: e.target.value }))}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${p}-credential`} className="text-xs text-zinc-400">
                          Credential
                        </Label>
                        <select
                          id={`${p}-credential`}
                          value={credentialIds[p]}
                          onChange={(e) =>
                            setCredentialIds((prev) => ({ ...prev, [p]: e.target.value }))
                          }
                          className="flex h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100"
                        >
                          <option value="">None — prompt at connect</option>
                          {p === "ssh" && (
                            <option value="__bastion__">Wyvern SSH key</option>
                          )}
                          {credentials.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  {enabled[p] && p === "ssh" && (
                    <p className="text-xs text-zinc-500">
                      On Ubuntu:{" "}
                      <code className="rounded bg-zinc-800 px-1">
                        sudo apt install openssh-server &amp;&amp; sudo systemctl enable --now ssh
                      </code>
                    </p>
                  )}
                </div>
              ))}
            </div>
            {enabled.vnc && (parseInt(ports.vnc, 10) === 3389 || parseInt(ports.vnc, 10) === 22) && (
              <p className="text-xs text-amber-400">
                VNC is typically port 5900 (or 5901, 5902…).
              </p>
            )}
          </div>

          {needsUsername && (
            <div className="space-y-2">
              <Label htmlFor="username">Default Username</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              <p className="text-xs text-zinc-500">
                Used for SSH and RDP when the saved credential does not include a username.
              </p>
            </div>
          )}

          {supportsWake && (
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <div>
                <Label htmlFor="mac-address">Wake-on-LAN (optional)</Label>
                <p className="mt-1 text-xs text-zinc-500">
                  MAC address of the remote machine. Used to wake sleeping hosts before VNC or RDP connects.
                </p>
              </div>
              <Input
                id="mac-address"
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                placeholder="aa:bb:cc:dd:ee:ff"
                className="font-mono text-sm"
              />
              <div className="space-y-1">
                <Label htmlFor="wol-broadcast" className="text-xs text-zinc-400">
                  Broadcast address (optional)
                </Label>
                <Input
                  id="wol-broadcast"
                  value={wolBroadcast}
                  onChange={(e) => setWolBroadcast(e.target.value)}
                  placeholder="255.255.255.255"
                  className="h-8 font-mono text-sm"
                />
              </div>
            </div>
          )}

          {initial?.id && enabled.ssh && (
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <div>
                <Label>Wyvern SSH key deployment</Label>
                <p className="mt-1 text-xs text-zinc-500">
                  Deploy this server&apos;s SSH public key to the remote server&apos;s <code>authorized_keys</code> to allow secure passwordless authentication.
                </p>
              </div>

              {bastionPubKey && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400">Wyvern public key</span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-6 text-[10px] px-2 text-zinc-300 hover:text-zinc-150"
                      onClick={() => {
                        navigator.clipboard.writeText(bastionPubKey);
                        alert("Public key copied to clipboard!");
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-zinc-950 p-2 rounded text-[10px] font-mono text-zinc-400 overflow-x-auto select-all max-h-16 border border-zinc-850">
                    {bastionPubKey}
                  </pre>
                </div>
              )}

              {showDeployPassword && (
                <div className="space-y-1.5 pt-1 border-t border-zinc-850">
                  <Label htmlFor="deploy-pwd" className="text-xs text-zinc-400">
                    Temporary SSH Password
                  </Label>
                  <p className="text-[10px] text-zinc-500">
                    Enter the password for <code>{username || initial.username || "username"}</code> to connect and deploy the key.
                  </p>
                  <Input
                    id="deploy-pwd"
                    type="password"
                    value={deployPassword}
                    onChange={(e) => setDeployPassword(e.target.value)}
                    placeholder="SSH password"
                    className="h-8 max-w-sm bg-zinc-900 border-zinc-700"
                  />
                </div>
              )}

              {deployError && (
                <p className="text-xs text-red-400 font-medium">
                  {deployError}
                </p>
              )}
              {deploySuccess && (
                <p className="text-xs text-emerald-400 font-medium">
                  Bastion public key deployed successfully! You can now use key-based authentication.
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={deployingKey}
                  onClick={() => void handleDeployKey()}
                >
                  {deployingKey ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Deploying...
                    </>
                  ) : showDeployPassword ? (
                    "Deploy with Password"
                  ) : (
                    "Deploy SSH Key Automatically"
                  )}
                </Button>
                {showDeployPassword && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowDeployPassword(false);
                      setDeployPassword("");
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

interface CredentialFormData {
  label: string;
  username: string;
  password: string;
  privateKey: string;
  passphrase: string;
}

interface CredentialFormProps {
  initial?: Partial<CredentialFormData> & { id?: string };
  hasExistingPassword?: boolean;
  hasExistingPrivateKey?: boolean;
  hasExistingPassphrase?: boolean;
  onSubmit: (data: CredentialFormData) => Promise<void>;
  onCancel?: () => void;
}

export function CredentialForm({
  initial,
  hasExistingPassword = false,
  hasExistingPrivateKey = false,
  hasExistingPassphrase = false,
  onSubmit,
  onCancel,
}: CredentialFormProps) {
  const [label, setLabel] = useState(initial?.label || "");
  const [username, setUsername] = useState(initial?.username || "");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onSubmit({ label, username, password, privateKey, passphrase });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initial ? "Edit Credential" : "New Credential"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cred-label">Label</Label>
            <Input id="cred-label" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cred-username">Username (optional)</Label>
            <Input id="cred-username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cred-password">Password (optional)</Label>
            <Input
              id="cred-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                hasExistingPassword ? "Leave blank to keep existing password" : undefined
              }
            />
            {hasExistingPassword && (
              <p className="text-xs text-zinc-500">A password is saved. Enter a new value to replace it.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cred-key">Private Key (optional)</Label>
            <Textarea
              id="cred-key"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder={
                hasExistingPrivateKey
                  ? "Leave blank to keep existing private key"
                  : "-----BEGIN OPENSSH PRIVATE KEY-----"
              }
              rows={4}
              className="font-mono text-xs"
            />
            {hasExistingPrivateKey && (
              <p className="text-xs text-zinc-500">A private key is saved. Paste a new key to replace it.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cred-passphrase">Key Passphrase (optional)</Label>
            <Input
              id="cred-passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={
                hasExistingPassphrase ? "Leave blank to keep existing passphrase" : undefined
              }
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
