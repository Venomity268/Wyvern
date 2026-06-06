"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

function HistoryTable({
  items,
  showActions,
  onEnd,
  endingId,
}: {
  items: HistoryItem[];
  showActions: boolean;
  onEnd?: (id: string) => void;
  endingId?: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-400">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Host</th>
            <th className="px-4 py-3 font-medium">Protocol</th>
            <th className="px-4 py-3 font-medium">Workspace</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Status</th>
            {showActions && <th className="px-4 py-3 font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody className="bg-card">
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b border-border last:border-b-0 hover:bg-zinc-800/40"
            >
              <td className="px-4 py-3 font-medium text-foreground">
                {item.connection_name || "—"}
              </td>
              <td className="px-4 py-3 text-zinc-300">{item.hostname || "—"}</td>
              <td className="px-4 py-3 uppercase text-zinc-300">{item.protocol}</td>
              <td className="px-4 py-3 text-zinc-300">{item.workspace_name || "—"}</td>
              <td className="px-4 py-3 text-zinc-300">
                {new Date(item.started_at + "Z").toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <span
                  className={
                    item.is_live
                      ? "font-medium text-emerald-400"
                      : item.status === "active"
                        ? "font-medium text-amber-400"
                        : item.status === "error"
                          ? "font-medium text-red-400"
                          : "text-zinc-400"
                  }
                >
                  {item.is_live ? "live" : item.status}
                </span>
              </td>
              {showActions && (
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {item.connection_id && (
                      <Link
                        href={`/session/${item.connection_id}?via=${item.protocol}`}
                      >
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
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
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
      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground">Sessions</h2>
        <p className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted">
          No connection history yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {hasActive && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-foreground">Active Sessions</h2>
          <p className="mb-3 text-xs text-muted">
            One entry per connection. Resume returns to an in-progress session; Open starts fresh.
          </p>
          <Card>
            <CardContent className="p-0">
              <HistoryTable
                items={activeItems}
                showActions
                onEnd={endSession}
                endingId={endingId}
              />
            </CardContent>
          </Card>
        </section>
      )}

      {hasRecent && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-foreground">Recent Connections</h2>
          <Card>
            <CardContent className="p-0">
              <HistoryTable items={recentItems} showActions={false} />
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
