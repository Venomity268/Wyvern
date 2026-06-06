export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import {
  getDb,
  createPersonalWorkspace,
  listWorkspacesForUser,
} from "@/lib/db/index";
import { ConnectionHistory } from "@/components/ConnectionHistory";
import { PinnedConnections } from "@/components/PinnedConnections";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ConnectionItem } from "@/components/ConnectionList";
import { attachMethods } from "@/lib/db/connection-methods";
import { listActiveSessions } from "@/lib/sessions/reconcile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderOpen, Zap } from "lucide-react";

export default async function HomePage() {
  const session = await getSession();
  const user = session.user!;

  createPersonalWorkspace(getDb(), user.id);
  const workspaces = listWorkspacesForUser(getDb(), user.id);

  const activeSessions = listActiveSessions(user.id);

  const recentHistory = getDb()
    .prepare(
      `SELECT h.*, w.name AS workspace_name
       FROM connection_history h
       LEFT JOIN workspaces w ON w.id = h.workspace_id
       WHERE h.user_id = ? AND h.status != 'active'
       ORDER BY h.started_at DESC LIMIT 10`,
    )
    .all(user.id);

  const pinnedRows = getDb()
    .prepare(
      `SELECT c.* FROM connections c
       INNER JOIN pinned_connections p ON p.connection_id = c.id
       WHERE p.user_id = ?
       ORDER BY p.pinned_at DESC`,
    )
    .all(user.id) as { id: string }[];

  const pinnedConnections = attachMethods(pinnedRows) as ConnectionItem[];

  const displayName = "displayName" in user && user.displayName ? user.displayName : user.email.split("@")[0];

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <PageHeader
        title={`Welcome back${displayName ? `, ${displayName}` : ""}`}
        description="Connect to hosts in your workspaces or use quick connect for one-off sessions."
        actions={
          <Link href="/connect">
            <Button size="sm">
              <Zap className="h-4 w-4" />
              Quick connect
            </Button>
          </Link>
        }
      />

      <PinnedConnections connections={pinnedConnections} />

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Workspaces</h2>
          <Link href="/workspaces/new">
            <Button variant="ghost" size="sm">
              Create workspace
            </Button>
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => {
            const connCount = getDb()
              .prepare("SELECT COUNT(*) as c FROM connections WHERE workspace_id = ?")
              .get(ws.id) as { c: number };
            return (
              <Link
                key={ws.id}
                href={`/workspace/${ws.id}`}
                className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-card-hover"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FolderOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground group-hover:text-primary">{ws.name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {connCount.c} connection{connCount.c === 1 ? "" : "s"}
                      </Badge>
                      {ws.is_personal ? <Badge variant="outline">Personal</Badge> : null}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <ConnectionHistory
        activeItems={activeSessions as Parameters<typeof ConnectionHistory>[0]["activeItems"]}
        recentItems={recentHistory as Parameters<typeof ConnectionHistory>[0]["recentItems"]}
      />
    </div>
  );
}
