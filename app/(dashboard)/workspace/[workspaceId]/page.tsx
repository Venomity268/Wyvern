"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ConnectionList, ConnectionItem } from "@/components/ConnectionList";
import { ConnectionForm, CredentialForm, ConnectionFormData } from "@/components/ConnectionForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WorkspaceInfo {
  id: string;
  name: string;
  is_personal: number;
}

interface Member {
  user_id: string;
  email: string;
  role: string;
}

interface CredentialItem {
  id: string;
  label: string;
  username?: string | null;
  has_password?: number | boolean;
  has_private_key?: number | boolean;
  has_passphrase?: number | boolean;
}

export default function WorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [credentials, setCredentials] = useState<CredentialItem[]>([]);
  const [showConnForm, setShowConnForm] = useState(false);
  const [showCredForm, setShowCredForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rename, setRename] = useState("");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [wsRes, connRes, credRes, allWsRes, pinsRes] = await Promise.all([
      fetch(`/api/workspaces/${workspaceId}`),
      fetch(`/api/connections?workspaceId=${workspaceId}`),
      fetch(`/api/credentials?workspaceId=${workspaceId}`),
      fetch("/api/workspaces"),
      fetch("/api/pins"),
    ]);
    if (!wsRes.ok) {
      setError("Workspace not found or access denied");
      return;
    }
    const wsData = await wsRes.json();
    const connData = await connRes.json();
    const credData = await credRes.json();
    const allWsData = await allWsRes.json();
    const pinsData = pinsRes.ok ? await pinsRes.json() : { connections: [] };
    setWorkspace(wsData.workspace);
    setMembers(wsData.members || []);
    setConnections(connData.connections || []);
    setCredentials(credData.credentials || []);
    setWorkspaces(allWsData.workspaces || []);
    setRename(wsData.workspace?.name || "");
    setPinnedIds(new Set((pinsData.connections || []).map((c: { id: string }) => c.id)));
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveConnection(data: ConnectionFormData) {
    if (editingId) {
      await fetch("/api/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, workspace_id: workspaceId, ...data }),
      });
    } else {
      await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, ...data }),
      });
    }
    setShowConnForm(false);
    setEditingId(null);
    await load();
  }

  async function saveCredential(data: {
    label: string;
    username: string;
    password: string;
    privateKey: string;
    passphrase: string;
  }) {
    if (editingCredId) {
      const res = await fetch("/api/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingCredId, ...data }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update credential");
      }
    } else {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, ...data }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create credential");
      }
    }
    setShowCredForm(false);
    setEditingCredId(null);
    await load();
  }

  async function deleteConnection(id: string) {
    if (!confirm("Delete this connection?")) return;
    await fetch(`/api/connections?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function deleteCredential(id: string) {
    if (!confirm("Delete this credential?")) return;
    await fetch(`/api/credentials?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function moveConnection(id: string, targetWorkspaceId: string) {
    const res = await fetch("/api/connections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, workspace_id: targetWorkspaceId }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to move connection");
      return;
    }
    const data = await res.json();
    const prev = connections.find((c) => c.id === id);
    const hadCredentials =
      prev?.credential_id ||
      prev?.methods?.some((m) => m.credential_id);
    const conn = data.connection;
    const credsCleared =
      hadCredentials &&
      !conn?.credential_id &&
      !conn?.methods?.some((m: { credential_id?: string | null }) => m.credential_id);
    if (credsCleared) {
      alert(
        "Connection moved. Saved credentials stay in the original workspace and were unlinked — re-assign credentials in the new workspace if needed.",
      );
    }
    if (targetWorkspaceId !== workspaceId) {
      router.push(`/workspace/${targetWorkspaceId}`);
      return;
    }
    await load();
  }

  async function duplicateConnection(id: string, targetWorkspaceId: string) {
    const conn = connections.find((c) => c.id === id);
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        duplicateFromId: id,
        workspace_id: targetWorkspaceId,
        name: conn ? `${conn.name} (copy)` : undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to duplicate connection");
      return;
    }
    if (targetWorkspaceId === workspaceId) {
      await load();
    } else {
      router.push(`/workspace/${targetWorkspaceId}`);
    }
  }

  async function togglePin(connectionId: string) {
    await fetch("/api/pins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    await load();
  }

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to invite");
      return;
    }
    setInviteEmail("");
    await load();
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member?")) return;
    await fetch(`/api/workspaces/${workspaceId}/members?userId=${userId}`, {
      method: "DELETE",
    });
    await load();
  }

  async function saveRename(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: rename }),
    });
    setSettingsOpen(false);
    await load();
  }

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }

  if (!workspace) {
    return <p className="text-muted">Loading…</p>;
  }

  const editingConn = editingId ? connections.find((c) => c.id === editingId) : undefined;
  const editingCred = editingCredId ? credentials.find((c) => c.id === editingCredId) : undefined;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">{workspace.name}</h1>
          <p className="text-sm text-zinc-400">
            {workspace.is_personal
              ? "Your personal connections and credentials."
              : "Team workspace — shared connections and credentials."}
          </p>
        </div>
        {!workspace.is_personal && (
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen((v) => !v)}>
            Workspace settings
          </Button>
        )}
      </div>

      {settingsOpen && !workspace.is_personal && (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <form onSubmit={saveRename} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Workspace name</Label>
              <Input value={rename} onChange={(e) => setRename(e.target.value)} required />
            </div>
            <Button type="submit" size="sm">
              Save name
            </Button>
          </form>

          <div>
            <h3 className="mb-2 text-sm font-medium">Members</h3>
            <ul className="mb-3 space-y-1">
              {members.map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between rounded border border-zinc-800 px-3 py-2 text-sm"
                >
                  <span>
                    {m.email}{" "}
                    <span className="text-zinc-500">({m.role})</span>
                  </span>
                  {m.role !== "owner" && (
                    <Button size="sm" variant="ghost" onClick={() => removeMember(m.user_id)}>
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <form onSubmit={inviteMember} className="flex flex-wrap gap-2">
              <Input
                type="email"
                placeholder="Invite by email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                className="max-w-xs"
              />
              <Button type="submit" size="sm">
                Invite
              </Button>
            </form>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connections</h2>
          <Button onClick={() => { setShowConnForm(true); setEditingId(null); }}>
            Add Connection
          </Button>
        </div>
        {showConnForm && (
          <ConnectionForm
            workspaceId={workspaceId}
            workspaces={workspaces}
            credentials={credentials}
            initial={
              editingConn
                ? {
                    ...editingConn,
                    methods: editingConn.methods,
                  }
                : undefined
            }
            onSubmit={saveConnection}
            onCancel={() => { setShowConnForm(false); setEditingId(null); }}
          />
        )}
        <ConnectionList
          connections={connections}
          editable
          workspaces={workspaces}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          onEdit={(id) => { setEditingId(id); setShowConnForm(true); }}
          onDelete={deleteConnection}
          onMove={moveConnection}
          onDuplicate={duplicateConnection}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Credentials</h2>
          <Button variant="outline" onClick={() => { setShowCredForm(true); setEditingCredId(null); }}>
            Add Credential
          </Button>
        </div>
        {showCredForm && (
          <CredentialForm
            initial={
              editingCred
                ? { id: editingCred.id, label: editingCred.label, username: editingCred.username || "" }
                : undefined
            }
            hasExistingPassword={!!editingCred?.has_password}
            hasExistingPrivateKey={!!editingCred?.has_private_key}
            hasExistingPassphrase={!!editingCred?.has_passphrase}
            onSubmit={saveCredential}
            onCancel={() => { setShowCredForm(false); setEditingCredId(null); }}
          />
        )}
        {credentials.length > 0 ? (
          <ul className="space-y-2">
            {credentials.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
              >
                <div>
                  <span>{c.label}</span>
                  {c.username && (
                    <span className="ml-2 text-sm text-zinc-500">({c.username})</span>
                  )}
                  <span className="ml-2 text-xs text-zinc-600">
                    {c.has_password ? "password" : ""}
                    {c.has_password && c.has_private_key ? " · " : ""}
                    {c.has_private_key ? "key" : ""}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditingCredId(c.id); setShowCredForm(true); }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteCredential(c.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No credentials stored yet.</p>
        )}
      </section>
    </div>
  );
}
