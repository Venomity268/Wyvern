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
import type { ConnectionItem } from "@/components/ConnectionList";
import { attachMethods } from "@/lib/db/connection-methods";
import { listActiveSessions } from "@/lib/sessions/reconcile";
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

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">
          Connect to hosts in your workspaces or use quick connect for one-off sessions.
        </p>
        <div className="mt-3">
          <Link href="/connect">
            <Button variant="outline" size="sm">
              <Zap className="mr-1 h-4 w-4" />
              Quick connect
            </Button>
          </Link>
        </div>
      </div>

      <PinnedConnections connections={pinnedConnections} />

      <section>
        <div className="mb-3 flex items-center justify-between">
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
                className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-zinc-800/40"
              >
                <div className="flex items-start gap-3">
                  <FolderOpen className="mt-0.5 h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="font-medium text-foreground">{ws.name}</p>
                    <p className="text-sm text-muted">
                      {connCount.c} connection{connCount.c === 1 ? "" : "s"}
                      {ws.is_personal ? " · Personal" : ""}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <ConnectionHistory
          activeItems={
            activeSessions as Parameters<typeof ConnectionHistory>[0]["activeItems"]
          }
          recentItems={
            recentHistory as Parameters<typeof ConnectionHistory>[0]["recentItems"]
          }
        />
      </section>
    </div>
  );
}
