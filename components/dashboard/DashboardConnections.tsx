"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConnectionList, type ConnectionItem } from "@/components/ConnectionList";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Plug, Zap } from "lucide-react";

interface DashboardConnectionsProps {
  connections: ConnectionItem[];
  pinnedIds: Set<string>;
}

export function DashboardConnections({ connections, pinnedIds }: DashboardConnectionsProps) {
  const router = useRouter();

  async function togglePin(connectionId: string) {
    await fetch("/api/pins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    router.refresh();
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Your connections</h2>
          <p className="mt-0.5 text-xs text-muted">
            {connections.length} across your workspaces · pinned first
          </p>
        </div>
        <Link href="/connect">
          <Button variant="outline" size="sm">
            <Zap className="h-4 w-4" />
            Quick connect
          </Button>
        </Link>
      </div>

      {connections.length === 0 ?
        <EmptyState
          icon={<Plug className="h-5 w-5" />}
          title="No connections yet"
          description="Add hosts in a workspace from the sidebar, or jump in with quick connect."
          action={
            <Link href="/connect">
              <Button size="sm">
                <Zap className="h-4 w-4" />
                Quick connect
              </Button>
            </Link>
          }
        />
      : <ConnectionList
          connections={connections}
          layout="grid"
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          showWorkspaceName
        />
      }
    </section>
  );
}
