"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Member {
  user_id: string;
  email: string;
  role: string;
}

interface WorkspaceSettingsPanelProps {
  rename: string;
  onRenameChange: (name: string) => void;
  onSaveRename: (e: React.FormEvent) => void;
  members: Member[];
  inviteEmail: string;
  onInviteEmailChange: (email: string) => void;
  onInviteMember: (e: React.FormEvent) => void;
  onRemoveMember: (userId: string) => void;
}

export function WorkspaceSettingsPanel({
  rename,
  onRenameChange,
  onSaveRename,
  members,
  inviteEmail,
  onInviteEmailChange,
  onInviteMember,
  onRemoveMember,
}: WorkspaceSettingsPanelProps) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <form onSubmit={onSaveRename} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Workspace name</Label>
          <Input value={rename} onChange={(e) => onRenameChange(e.target.value)} required />
        </div>
        <Button type="submit" size="sm">
          Save name
        </Button>
      </form>

      <div>
        <h3 className="mb-2 text-sm font-medium text-foreground">Members</h3>
        <ul className="mb-3 space-y-1">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate" title={m.email}>
                  {m.email}
                </span>
                <span className="shrink-0 text-muted-foreground">({m.role})</span>
              </div>
              {m.role !== "owner" && (
                <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onRemoveMember(m.user_id)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={onInviteMember} className="flex flex-wrap gap-2">
          <Input
            type="email"
            placeholder="Invite by email"
            value={inviteEmail}
            onChange={(e) => onInviteEmailChange(e.target.value)}
            required
            className="max-w-xs"
          />
          <Button type="submit" size="sm">
            Invite
          </Button>
        </form>
      </div>
    </section>
  );
}
