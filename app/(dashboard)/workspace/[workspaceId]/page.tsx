"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ConnectionList, ConnectionItem } from "@/components/ConnectionList";
import { ConnectionForm, ConnectionFormData } from "@/components/ConnectionForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspaceFilters } from "@/components/workspace/WorkspaceFilters";
import { WorkspaceSettingsPanel } from "@/components/workspace/WorkspaceSettingsPanel";
import { CredentialsSection } from "@/components/workspace/CredentialsSection";
import {
  getFolderDescendants,
  getFolderPath,
  type FolderOption,
} from "@/components/workspace/FolderTree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

  if (error) {
    return <p className="text-destructive">{error}</p>;
  }

  if (!workspace) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const editingConn = editingId ? connections.find((c) => c.id === editingId) : undefined;
  const editingCred = editingCredId ? credentials.find((c) => c.id === editingCredId) : undefined;

  const allTags = Array.from(
    new Set(
      connections
        .map((c) => c.tags)
        .filter(Boolean)
        .flatMap((t) => t!.split(",").map((s) => s.trim())),
    ),
  ).sort();

  const filteredConnections = connections.filter((c) => {
    if (selectedFolderId === "unassigned") {
      if (c.folder_id !== null && c.folder_id !== undefined) return false;
    } else if (selectedFolderId !== null) {
      const allowedFolderIds = getFolderDescendants(selectedFolderId, folders);
      if (!c.folder_id || !allowedFolderIds.includes(c.folder_id)) return false;
    }

    if (selectedTag) {
      const connTags = c.tags ? c.tags.split(",").map((t) => t.trim()) : [];
      if (!connTags.includes(selectedTag)) return false;
    }

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

  const hasActiveFilters =
    selectedFolderId !== null || selectedTag !== null || searchQuery !== "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={workspace.name}
        description={
          workspace.is_personal ?
            "Your personal connections and credentials."
          : "Team workspace — shared connections and credentials."
        }
        actions={
          !workspace.is_personal ?
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen((v) => !v)}>
              Workspace settings
            </Button>
          : undefined
        }
      />

      {settingsOpen && !workspace.is_personal && (
        <WorkspaceSettingsPanel
          rename={rename}
          onRenameChange={setRename}
          onSaveRename={saveRename}
          members={members}
          inviteEmail={inviteEmail}
          onInviteEmailChange={setInviteEmail}
          onInviteMember={inviteMember}
          onRemoveMember={removeMember}
        />
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <WorkspaceFilters
          folders={folders}
          allTags={allTags}
          selectedFolderId={selectedFolderId}
          selectedTag={selectedTag}
          onSelectFolder={setSelectedFolderId}
          onSelectTag={setSelectedTag}
          isCreatingFolder={isCreatingFolder}
          creatingFolderParentId={creatingFolderParentId}
          newFolderName={newFolderName}
          onNewFolderNameChange={setNewFolderName}
          onStartCreateFolder={(parentId) => {
            setCreatingFolderParentId(parentId);
            setIsCreatingFolder(true);
          }}
          onCreateFolder={() => void handleCreateFolder()}
          onCancelCreateFolder={() => {
            setIsCreatingFolder(false);
            setNewFolderName("");
          }}
          editingFolderId={editingFolderId}
          editingFolderName={editingFolderName}
          onEditingFolderNameChange={setEditingFolderName}
          onStartEditFolder={(id, name) => {
            setEditingFolderId(id);
            setEditingFolderName(name);
          }}
          onRenameFolder={() => void handleRenameFolder()}
          onCancelEditFolder={() => {
            setEditingFolderId(null);
            setEditingFolderName("");
          }}
          onDeleteFolder={(id) => void handleDeleteFolder(id)}
        />

        <div className="min-w-0 flex-1 space-y-8">
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">Connections</h2>
                {selectedFolderId && selectedFolderId !== "unassigned" && (
                  <Badge variant="secondary" className="font-mono font-normal">
                    {getFolderPath(selectedFolderId, folders)}
                  </Badge>
                )}
                {selectedFolderId === "unassigned" && (
                  <Badge variant="secondary" className="font-mono font-normal">
                    Unassigned
                  </Badge>
                )}
                {selectedTag && (
                  <Badge variant="secondary" className="font-mono font-normal">
                    #{selectedTag}
                  </Badge>
                )}
              </div>
              <Button onClick={() => { setShowConnForm(true); setEditingId(null); }}>
                Add connection
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="search"
                placeholder="Search by name, host, user, or tags…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedFolderId(null);
                    setSelectedTag(null);
                    setSearchQuery("");
                  }}
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
                  editingConn ?
                    { ...editingConn, methods: editingConn.methods }
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

          <CredentialsSection
            credentials={credentials}
            showCredForm={showCredForm}
            editingCred={editingCred}
            onShowForm={() => { setShowCredForm(true); setEditingCredId(null); }}
            onEdit={(id) => { setEditingCredId(id); setShowCredForm(true); }}
            onDelete={deleteCredential}
            onSubmit={saveCredential}
            onCancel={() => { setShowCredForm(false); setEditingCredId(null); }}
          />
        </div>
      </div>
    </div>
  );
}
