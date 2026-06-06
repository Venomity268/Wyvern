"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/EmptyState";
import { History } from "lucide-react";
import type { ConnectionProtocol } from "@/lib/protocols";

export interface HistoryItem {
  id: string;
  connection_id: string | null;
  connection_name: string | null;
  hostname: string | null;
  protocol: string;
  workspace_name?: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  is_live?: boolean;
}

function protocolBadgeVariant(protocol: string): "ssh" | "vnc" | "rdp" | "secondary" {
  if (protocol === "ssh" || protocol === "vnc" || protocol === "rdp") {
    return protocol;
  }
  return "secondary";
}

function StatusDot({ live }: { live: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {live && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-muted"}`}
      />
    </span>
  );
}

function HistoryRow({
  item,
  showActions,
  onEnd,
  endingId,
}: {
  item: HistoryItem;
  showActions: boolean;
  onEnd?: (id: string) => void;
  endingId?: string | null;
}) {
  const statusLabel = item.is_live ? "live" : item.status;
  const statusVariant =
    item.is_live ? "success"
    : item.status === "active" ? "warning"
    : item.status === "error" ? "destructive"
    : "secondary";

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {item.is_live && <StatusDot live />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-medium text-foreground">
              {item.connection_name || "—"}
            </h4>
            <Badge variant={protocolBadgeVariant(item.protocol)} className="font-mono uppercase">
              {item.protocol}
            </Badge>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
            {item.hostname || "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.workspace_name && <span>{item.workspace_name} · </span>}
            {new Date(item.started_at + "Z").toLocaleString()}
          </p>
        </div>
      </div>

      {showActions && (
        <div className="flex shrink-0 gap-2">
          {item.connection_id && (
            <Link href={`/session/${item.connection_id}?via=${item.protocol as ConnectionProtocol}`}>
              <Button size="sm" variant="outline">
                {item.is_live ? "Resume" : "Open"}
              </Button>
            </Link>
          )}
          {item.status === "active" && onEnd && (
            <Button
              size="sm"
              variant="destructive"
              disabled={endingId === item.id}
              onClick={() => onEnd(item.id)}
            >
              {endingId === item.id ? "Ending…" : "End"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function ConnectionHistory({
  activeItems,
  recentItems,
}: {
  activeItems: HistoryItem[];
  recentItems: HistoryItem[];
}) {
  const router = useRouter();
  const [endingId, setEndingId] = useState<string | null>(null);

  async function endSession(id: string) {
    if (!confirm("End this session? The connection will be disconnected if still active.")) {
      return;
    }
    setEndingId(id);
    try {
      const res = await fetch(`/api/history/${id}/end`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to end session");
        return;
      }
      router.refresh();
    } finally {
      setEndingId(null);
    }
  }

  const hasActive = activeItems.length > 0;
  const hasRecent = recentItems.length > 0;

  if (!hasActive && !hasRecent) {
    return (
      <section>
        <h2 className="mb-4 text-sm font-medium text-foreground">Sessions</h2>
        <EmptyState
          icon={<History className="h-5 w-5" />}
          title="No connection history yet"
          description="Your recent and active sessions will appear here."
        />
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {hasActive && (
        <section>
          <h2 className="mb-1 text-sm font-medium text-foreground">Active sessions</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Resume returns to an in-progress session; Open starts fresh.
          </p>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {activeItems.map((item) => (
                <HistoryRow
                  key={item.id}
                  item={item}
                  showActions
                  onEnd={endSession}
                  endingId={endingId}
                />
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {hasRecent && (
        <section>
          <h2 className="mb-4 text-sm font-medium text-foreground">Recent connections</h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {recentItems.map((item) => (
                <HistoryRow key={item.id} item={item} showActions={false} />
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
