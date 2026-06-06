"use client";

import { Monitor, Terminal, MoreHorizontal, Pin } from "lucide-react";
import type { ConnectionProtocol } from "@/lib/protocols";
import type { HostMetricsSummary } from "@/lib/host-info/summary";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WakeConnectButton } from "@/components/WakeConnectButton";
import { HostMetricsCardSummary } from "@/components/host-metrics/HostMetricsCardSummary";

export interface ConnectionMethod {
  protocol: ConnectionProtocol;
  port: number;
  credential_id?: string | null;
}

export type ConnectionHostInfo = HostMetricsSummary;

export interface ConnectionItem {
  id: string;
  name: string;
  hostname: string;
  port: number;
  protocol: ConnectionProtocol;
  methods?: ConnectionMethod[];
  workspace_id?: string;
  username?: string | null;
  credential_id?: string | null;
  mac_address?: string | null;
  wol_broadcast?: string | null;
  host_info?: ConnectionHostInfo | null;
}

interface WorkspaceOption {
  id: string;
  name: string;
}

interface ConnectionListProps {
  connections: ConnectionItem[];
  editable?: boolean;
  layout?: "list" | "grid";
  workspaces?: WorkspaceOption[];
  pinnedIds?: Set<string>;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMove?: (id: string, workspaceId: string) => Promise<void> | void;
  onDuplicate?: (id: string, workspaceId: string) => Promise<void> | void;
  onTogglePin?: (id: string) => Promise<void> | void;
}

const PROTOCOL_STYLE: Record<
  ConnectionProtocol,
  { icon: typeof Terminal; color: string; ring: string; bg: string }
> = {
  ssh: {
    icon: Terminal,
    color: "text-emerald-400",
    ring: "ring-emerald-500/20",
    bg: "bg-emerald-500/10",
  },
  vnc: {
    icon: Monitor,
    color: "text-sky-400",
    ring: "ring-sky-500/20",
    bg: "bg-sky-500/10",
  },
  rdp: {
    icon: Monitor,
    color: "text-violet-400",
    ring: "ring-violet-500/20",
    bg: "bg-violet-500/10",
  },
};

function sessionHref(connectionId: string, protocol: ConnectionProtocol) {
  return `/session/${connectionId}?via=${protocol}`;
}

function ConnectionCard({
  conn,
  editable,
  workspaces,
  pinned,
  onEdit,
  onDelete,
  onMove,
  onDuplicate,
  onTogglePin,
}: {
  conn: ConnectionItem;
  editable: boolean;
  workspaces: WorkspaceOption[];
  pinned?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMove?: (id: string, workspaceId: string) => Promise<void> | void;
  onDuplicate?: (id: string, workspaceId: string) => Promise<void> | void;
  onTogglePin?: (id: string) => Promise<void> | void;
}) {
  const methods =
    conn.methods?.length ?
      conn.methods
    : [{ protocol: conn.protocol, port: conn.port }];

  const target = `${conn.username ? `${conn.username}@` : ""}${conn.hostname}`;
  const hasMove = onMove && workspaces.some((w) => w.id !== conn.workspace_id);
  const hasDuplicate = onDuplicate && workspaces.length > 0;
  const hasSsh = methods.some((m) => m.protocol === "ssh");

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card transition-colors hover:border-zinc-600">
      <div className="flex gap-3 p-4 pb-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 ring-1 ring-zinc-700">
          <Monitor className="h-4 w-4 text-zinc-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium leading-snug text-foreground">{conn.name}</h3>
          <p className="mt-1 break-all font-mono text-xs text-muted">{target}</p>
          {conn.mac_address && (
            <p className="mt-1 font-mono text-[10px] text-zinc-600">WoL {conn.mac_address}</p>
          )}
        </div>
        {onTogglePin && (
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-8 shrink-0 p-0 ${pinned ? "text-amber-400" : "text-zinc-500"}`}
            title={pinned ? "Unpin from home" : "Pin to home"}
            onClick={() => void onTogglePin(conn.id)}
          >
            {pinned ? <Pin className="h-4 w-4 fill-current" /> : <Pin className="h-4 w-4" />}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {methods.map((m) => {
          const style = PROTOCOL_STYLE[m.protocol];
          return (
            <WakeConnectButton
              key={m.protocol}
              href={sessionHref(conn.id, m.protocol)}
              protocol={m.protocol}
              connectionId={conn.id}
              macAddress={conn.mac_address}
              label={`${m.protocol.toUpperCase()} :${m.port}`}
              className={cn("gap-1.5 border-zinc-700", style.color)}
            />
          );
        })}
      </div>

      <HostMetricsCardSummary
        connectionId={conn.id}
        connectionName={conn.name}
        hasSsh={hasSsh}
      />

      {editable && (
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border p-3">
          {onEdit && (
            <Button size="sm" variant="outline" onClick={() => onEdit(conn.id)}>
              Edit
            </Button>
          )}
          {onDelete && (
            <Button size="sm" variant="destructive" onClick={() => onDelete(conn.id)}>
              Delete
            </Button>
          )}
          {(hasMove || hasDuplicate) && (
            <div className="relative min-w-0 flex-1">
              <MoreHorizontal className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <select
                className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 pl-7 pr-2 text-xs text-zinc-300"
                defaultValue=""
                onChange={async (e) => {
                  const value = e.target.value;
                  if (!value) return;
                  const [action, workspaceId] = value.split(":");
                  if (action === "move" && onMove) await onMove(conn.id, workspaceId);
                  if (action === "duplicate" && onDuplicate) {
                    await onDuplicate(conn.id, workspaceId);
                  }
                  e.target.value = "";
                }}
                title="Move or duplicate to workspace"
              >
                <option value="" disabled>
                  Workspace…
                </option>
                {hasMove &&
                  workspaces
                    .filter((w) => w.id !== conn.workspace_id)
                    .map((w) => (
                      <option key={`move-${w.id}`} value={`move:${w.id}`}>
                        Move → {w.name}
                      </option>
                    ))}
                {hasDuplicate &&
                  workspaces.map((w) => (
                    <option key={`dup-${w.id}`} value={`duplicate:${w.id}`}>
                      Duplicate → {w.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function ConnectionList({
  connections,
  editable = false,
  layout = "grid",
  workspaces = [],
  pinnedIds,
  onEdit,
  onDelete,
  onMove,
  onDuplicate,
  onTogglePin,
}: ConnectionListProps) {
  if (connections.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted">
        No connections yet.
      </p>
    );
  }

  const wrapperClass = layout === "list" ? "space-y-3" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div className={wrapperClass}>
      {connections.map((conn) => (
        <ConnectionCard
          key={conn.id}
          conn={conn}
          editable={editable}
          workspaces={workspaces}
          pinned={pinnedIds?.has(conn.id)}
          onEdit={onEdit}
          onDelete={onDelete}
          onMove={onMove}
          onDuplicate={onDuplicate}
          onTogglePin={onTogglePin}
        />
      ))}
    </div>
  );
}
