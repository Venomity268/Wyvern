"use client";

import Link from "next/link";
import { Monitor, Terminal, MoreHorizontal, Pin, Plug } from "lucide-react";
import type { ConnectionProtocol } from "@/lib/protocols";
import type { HostMetricsSummary } from "@/lib/host-info/summary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/EmptyState";
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
  workspace_name?: string | null;
  folder_id?: string | null;
  tags?: string | null;
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
  showWorkspaceName?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMove?: (id: string, workspaceId: string) => Promise<void> | void;
  onDuplicate?: (id: string, workspaceId: string) => Promise<void> | void;
  onTogglePin?: (id: string) => Promise<void> | void;
}

const PROTOCOL_STYLE: Record<
  ConnectionProtocol,
  { icon: typeof Terminal; badge: "ssh" | "vnc" | "rdp" | "telnet"; ring: string }
> = {
  ssh: { icon: Terminal, badge: "ssh", ring: "ring-emerald-500/20" },
  telnet: { icon: Terminal, badge: "telnet", ring: "ring-orange-500/20" },
  vnc: { icon: Monitor, badge: "vnc", ring: "ring-sky-500/20" },
  rdp: { icon: Monitor, badge: "rdp", ring: "ring-violet-500/20" },
};

function sessionHref(connectionId: string, protocol: ConnectionProtocol) {
  return `/session/${connectionId}?via=${protocol}`;
}

function ConnectionCard({
  conn,
  editable,
  workspaces,
  pinned,
  showWorkspaceName,
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
  showWorkspaceName?: boolean;
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

  const primaryProtocol = methods[0]?.protocol ?? conn.protocol;
  const style = PROTOCOL_STYLE[primaryProtocol];
  const Icon = style.icon;
  const target = `${conn.username ? `${conn.username}@` : ""}${conn.hostname}`;
  const hasMove = onMove && workspaces.some((w) => w.id !== conn.workspace_id);
  const hasDuplicate = onDuplicate && workspaces.length > 0;
  const hasSsh = methods.some((m) => m.protocol === "ssh");

  return (
    <article className="flex flex-col rounded-lg border border-border bg-card transition-colors hover:border-primary/20 hover:bg-card-hover">
      <div className="flex gap-3 p-4 pb-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1",
            style.ring,
            "bg-accent",
          )}
        >
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium leading-snug text-foreground">{conn.name}</h3>
              {showWorkspaceName && conn.workspace_name && conn.workspace_id && (
                <Link
                  href={`/workspace/${conn.workspace_id}`}
                  className="mt-1 inline-flex text-xs text-muted transition-colors hover:text-primary"
                >
                  {conn.workspace_name}
                </Link>
              )}
            </div>
            {onTogglePin && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 shrink-0",
                  pinned ? "text-amber-400" : "text-muted-foreground",
                )}
                title={pinned ? "Unpin from home" : "Pin to home"}
                onClick={() => void onTogglePin(conn.id)}
              >
                <Pin className={cn("h-4 w-4", pinned && "fill-current")} />
              </Button>
            )}
          </div>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{target}</p>
          {conn.tags && (
            <div className="mt-2 flex flex-wrap gap-1">
              {conn.tags.split(",").map((tag) => (
                <Badge key={tag.trim()} variant="outline" className="text-[10px]">
                  #{tag.trim()}
                </Badge>
              ))}
            </div>
          )}
          {conn.mac_address && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">WoL {conn.mac_address}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {methods.map((m) => {
          const methodStyle = PROTOCOL_STYLE[m.protocol];
          return (
            <WakeConnectButton
              key={m.protocol}
              href={sessionHref(conn.id, m.protocol)}
              protocol={m.protocol}
              connectionId={conn.id}
              macAddress={conn.mac_address}
              label={`Connect ${m.protocol.toUpperCase()}`}
              className={cn("gap-1.5", methodStyle.badge === "ssh" && "border-emerald-500/30 text-emerald-400")}
            />
          );
        })}
      </div>

      <HostMetricsCardSummary
        connectionId={conn.id}
        connectionName={conn.name}
        hasSsh={hasSsh}
        initialSummary={conn.host_info}
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
              <MoreHorizontal className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select
                className="h-8 w-full rounded-md border border-border bg-input pl-7 pr-2 text-xs text-foreground"
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
  showWorkspaceName = false,
  onEdit,
  onDelete,
  onMove,
  onDuplicate,
  onTogglePin,
}: ConnectionListProps) {
  if (connections.length === 0) {
    return (
      <EmptyState
        icon={<Plug className="h-5 w-5" />}
        title="No connections yet"
        description="Add a connection to get started."
      />
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
          showWorkspaceName={showWorkspaceName}
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
