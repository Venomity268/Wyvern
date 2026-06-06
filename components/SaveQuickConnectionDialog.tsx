"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookmarkPlus, X } from "lucide-react";

interface WorkspaceOption {
  id: string;
  name: string;
}

interface SaveQuickConnectionDialogProps {
  quickSessionId: string;
  defaultName: string;
  hostname: string;
  protocol: string;
  workspaces: WorkspaceOption[];
  open: boolean;
  onClose: () => void;
}

export function SaveQuickConnectionDialog({
  quickSessionId,
  defaultName,
  hostname,
  protocol,
  workspaces,
  open,
  onClose,
}: SaveQuickConnectionDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || "");
  const [saveCredential, setSaveCredential] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/quick-connect/${quickSessionId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          workspace_id: workspaceId,
          saveCredential,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }

      router.push(`/workspace/${data.workspaceId}`);
      router.refresh();
    } catch {
      setError("Failed to save connection");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={handleSave}
        className="w-full max-w-md space-y-4 rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Save connection</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {protocol.toUpperCase()} → {hostname}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-1">
          <Label className="text-zinc-400">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="border-zinc-700 bg-zinc-800"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-zinc-400">Workspace</Label>
          <select
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={saveCredential}
            onChange={(e) => setSaveCredential(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Save credentials to workspace vault
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={loading}>
            <BookmarkPlus className="mr-1 h-4 w-4" />
            {loading ? "Saving…" : "Save connection"}
          </Button>
        </div>
      </form>
    </div>
  );
}
