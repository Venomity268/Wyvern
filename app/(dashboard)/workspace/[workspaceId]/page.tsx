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

interface FolderOption {
  id: string;
  workspace_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
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
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Folder forms state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");

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
    const [wsRes, connRes, credRes, allWsRes, foldersRes, pinsRes] = await Promise.all([
      fetch(`/api/workspaces/${workspaceId}`),
      fetch(`/api/connections?workspaceId=${workspaceId}`),
      fetch(`/api/credentials?workspaceId=${workspaceId}`),
      fetch("/api/workspaces"),
      fetch(`/api/folders?workspaceId=${workspaceId}`),
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
    const foldersData = foldersRes.ok ? await foldersRes.json() : { folders: [] };
    const pinsData = pinsRes.ok ? await pinsRes.json() : { connections: [] };

    setWorkspace(wsData.workspace);
    setMembers(wsData.members || []);
    setConnections(connData.connections || []);
    setCredentials(credData.credentials || []);
    setWorkspaces(allWsData.workspaces || []);
    setFolders(foldersData.folders || []);
    setRename(wsData.workspace?.name || "");
    setPinnedIds(new Set((pinsData.connections || []).map((c: { id: string }) => c.id)));
  }, [workspaceId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timeout);
  }, [load]);

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: workspaceId,
        name: newFolderName.trim(),
        parent_id: creatingFolderParentId,
      }),
    });
    if (!res.ok) {
      alert("Failed to create folder");
      return;
    }
    setNewFolderName("");
    setIsCreatingFolder(false);
    await load();
  }

  async function handleRenameFolder() {
    if (!editingFolderName.trim() || !editingFolderId) return;
    const res = await fetch("/api/folders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingFolderId,
        name: editingFolderName.trim(),
      }),
    });
    if (!res.ok) {
      alert("Failed to rename folder");
      return;
    }
    setEditingFolderName("");
    setEditingFolderId(null);
    await load();
  }

  async function handleDeleteFolder(id: string) {
    if (
      !confirm(
        "Delete this folder? Any subfolders will also be deleted, and connections will be moved to root."
      )
    )
      return;
    const res = await fetch(`/api/folders?id=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("Failed to delete folder");
      return;
    }
    if (selectedFolderId === id) {
      setSelectedFolderId(null);
    }
    await load();
  }

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

  function getFolderPath(fid: string | null, list: FolderOption[]): string {
    if (!fid) return "";
    const f = list.find((item) => item.id === fid);
    if (!f) return "";
    const parentPath = getFolderPath(f.parent_id, list);
    return parentPath ? `${parentPath} / ${f.name}` : f.name;
  }

  function renderFolderTree(parentId: string | null, depth: number): React.ReactNode[] {
    const list = folders.filter((f) => f.parent_id === parentId);
    return list.map((f) => {
      const isSelected = selectedFolderId === f.id;
      return (
        <div key={f.id} className="space-y-1">
          <div
            className={`group flex items-center justify-between rounded px-2 py-1 text-sm ${
              isSelected
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
            }`}
            style={{ paddingLeft: `${Math.max(8, depth * 16)}px` }}
          >
            <button
              onClick={() => setSelectedFolderId(f.id)}
              className="flex flex-1 items-center gap-2 text-left truncate min-w-0"
            >
              <span>📁</span>
              <span className="truncate text-xs md:text-sm">{f.name}</span>
            </button>
            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCreatingFolderParentId(f.id);
                  setIsCreatingFolder(true);
                }}
                title="Add Subfolder"
                className="text-xs text-zinc-500 hover:text-zinc-300 p-0.5"
              >
                ➕
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingFolderId(f.id);
                  setEditingFolderName(f.name);
                }}
                title="Rename Folder"
                className="text-xs text-zinc-500 hover:text-zinc-300 p-0.5"
              >
                ✏️
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDeleteFolder(f.id);
                }}
                title="Delete Folder"
                className="text-xs text-red-500 hover:text-red-400 p-0.5"
              >
                🗑️
              </button>
            </div>
          </div>
          {renderFolderTree(f.id, depth + 1)}
        </div>
      );
    });
  }

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }

  if (!workspace) {
    return <p className="text-muted">Loading…</p>;
  }

  const editingConn = editingId ? connections.find((c) => c.id === editingId) : undefined;
  const editingCred = editingCredId ? credentials.find((c) => c.id === editingCredId) : undefined;

  const allTags = Array.from(
    new Set(
      connections
        .map((c) => c.tags)
        .filter(Boolean)
        .flatMap((t) => t!.split(",").map((s) => s.trim()))
    )
  ).sort();

  const filteredConnections = connections.filter((c) => {
    // 1. Folder filter
    if (selectedFolderId === "unassigned") {
      if (c.folder_id !== null && c.folder_id !== undefined) return false;
    } else if (selectedFolderId !== null) {
      if (c.folder_id !== selectedFolderId) return false;
    }

    // 2. Tag filter
    if (selectedTag) {
      const connTags = c.tags ? c.tags.split(",").map((t) => t.trim()) : [];
      if (!connTags.includes(selectedTag)) return false;
    }

    // 3. Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchName = c.name.toLowerCase().includes(query);
      const matchHost = c.hostname.toLowerCase().includes(query);
      const matchUser = c.username?.toLowerCase().includes(query) || false;
      const matchTags = c.tags?.toLowerCase().includes(query) || false;
      return matchName || matchHost || matchUser || matchTags;
    }

    return true;
  });

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
                  className="flex items-center justify-between gap-3 rounded border border-zinc-800 px-3 py-2 text-sm min-w-0"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate" title={m.email}>{m.email}</span>
                    <span className="text-zinc-500 shrink-0">({m.role})</span>
                  </div>
                  {m.role !== "owner" && (
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => removeMember(m.user_id)}>
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

      {/* Main Grid View */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
        {/* Left column / Sidebar */}
        <div className="space-y-6 md:col-span-1">
          {/* Folders block */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-zinc-200">Folders</h3>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setCreatingFolderParentId(null);
                  setIsCreatingFolder(true);
                }}
              >
                + New
              </Button>
            </div>

            {/* Folder creation inline form */}
            {isCreatingFolder && (
              <div className="rounded border border-zinc-800 bg-zinc-950 p-2 space-y-2">
                <span className="text-xs text-zinc-400 block font-medium">
                  {creatingFolderParentId ? "New subfolder" : "New folder"}
                </span>
                <Input
                  className="h-8 text-xs bg-zinc-900 border-zinc-800 text-zinc-100"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  autoFocus
                />
                <div className="flex gap-1 justify-end">
                  <Button size="sm" className="h-6 text-xs px-2" onClick={handleCreateFolder}>Create</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-zinc-400" onClick={() => { setIsCreatingFolder(false); setNewFolderName(""); }}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Folder renaming inline form */}
            {editingFolderId && (
              <div className="rounded border border-zinc-800 bg-zinc-950 p-2 space-y-2">
                <span className="text-xs text-zinc-400 block font-medium">Rename folder</span>
                <Input
                  className="h-8 text-xs bg-zinc-900 border-zinc-800 text-zinc-100"
                  value={editingFolderName}
                  onChange={(e) => setEditingFolderName(e.target.value)}
                  placeholder="Folder name"
                  autoFocus
                />
                <div className="flex gap-1 justify-end">
                  <Button size="sm" className="h-6 text-xs px-2" onClick={handleRenameFolder}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-zinc-400" onClick={() => { setEditingFolderId(null); setEditingFolderName(""); }}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Folder rows */}
            <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
              <button
                onClick={() => setSelectedFolderId(null)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs md:text-sm transition-colors ${
                  selectedFolderId === null ? "bg-zinc-800 text-zinc-100 font-medium" : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
                }`}
              >
                📁 <span>All Connections</span>
              </button>
              <button
                onClick={() => setSelectedFolderId("unassigned")}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs md:text-sm transition-colors ${
                  selectedFolderId === "unassigned" ? "bg-zinc-800 text-zinc-100 font-medium" : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
                }`}
              >
                📁 <span>Unassigned</span>
              </button>

              <div className="mt-2 space-y-1">
                {renderFolderTree(null, 0)}
              </div>
            </div>
          </div>

          {/* Tags list block */}
          {allTags.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
              <h3 className="font-semibold text-sm text-zinc-200">Tags</h3>
              <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto pr-1">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors ${
                      selectedTag === tag
                        ? "bg-zinc-200 text-zinc-900 border-zinc-200"
                        : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column / Connections and Credentials */}
        <div className="md:col-span-3 space-y-8">
          {/* Connections section */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold flex flex-wrap items-center gap-2">
                  <span>Connections</span>
                  {selectedFolderId && selectedFolderId !== "unassigned" && (
                    <span className="text-xs bg-zinc-800 px-2 py-0.5 text-zinc-400 rounded-md font-mono font-normal">
                      Folder: {getFolderPath(selectedFolderId, folders)}
                    </span>
                  )}
                  {selectedFolderId === "unassigned" && (
                    <span className="text-xs bg-zinc-800 px-2 py-0.5 text-zinc-400 rounded-md font-mono font-normal">
                      Unassigned
                    </span>
                  )}
                  {selectedTag && (
                    <span className="text-xs bg-zinc-800 px-2 py-0.5 text-zinc-400 rounded-md font-mono font-normal">
                      #{selectedTag}
                    </span>
                  )}
                </h2>
              </div>
              <Button onClick={() => { setShowConnForm(true); setEditingId(null); }}>
                Add Connection
              </Button>
            </div>

            {/* Filter controls / Search bar */}
            <div className="flex items-center gap-2">
              <Input
                type="search"
                placeholder="Search connections by name, host, user or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border-zinc-800 placeholder-zinc-500 text-zinc-100"
              />
              {(selectedFolderId !== null || selectedTag !== null || searchQuery !== "") && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelectedFolderId(null);
                    setSelectedTag(null);
                    setSearchQuery("");
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Clear
                </Button>
              )}
            </div>

            {showConnForm && (
              <ConnectionForm
                workspaceId={workspaceId}
                workspaces={workspaces}
                credentials={credentials}
                folders={folders}
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
              connections={filteredConnections}
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

          {/* Credentials section */}
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
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-zinc-100 truncate block sm:inline">{c.label}</span>
                      {c.username && (
                        <span className="sm:ml-2 text-sm text-zinc-500 block sm:inline">({c.username})</span>
                      )}
                      <span className="sm:ml-2 text-xs text-zinc-600 block sm:inline mt-0.5 sm:mt-0">
                        {c.has_password ? "password" : ""}
                        {c.has_password && c.has_private_key ? " · " : ""}
                        {c.has_private_key ? "key" : ""}
                      </span>
                    </div>
                    <div className="flex gap-2 sm:justify-end w-full sm:w-auto shrink-0 border-t border-zinc-800/40 sm:border-0 pt-2 sm:pt-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 sm:flex-initial"
                        onClick={() => { setEditingCredId(c.id); setShowCredForm(true); }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 sm:flex-initial"
                        onClick={() => deleteCredential(c.id)}
                      >
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
      </div>
    </div>
  );
}
