export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import {
  getDb,
  createPersonalWorkspace,
  listWorkspacesForUser,
} from "@/lib/db/index";
import { ConnectionHistory } from "@/components/ConnectionHistory";
import { PageHeader } from "@/components/layout/PageHeader";
import { ServerStatsPanel } from "@/components/dashboard/ServerStatsPanel";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { DashboardConnections } from "@/components/dashboard/DashboardConnections";
import { ReplayCenter } from "@/components/dashboard/ReplayCenter";
import type { ConnectionItem } from "@/components/ConnectionList";
import { attachMethods } from "@/lib/db/connection-methods";
import { attachHostInfoSummary } from "@/lib/db/host-info";
import { listActiveSessions } from "@/lib/sessions/reconcile";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

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
       ORDER BY h.started_at DESC LIMIT 20`,
    )
    .all(user.id);

  const connectionRows = getDb()
    .prepare(
      `SELECT c.*, w.name AS workspace_name,
              CASE WHEN p.connection_id IS NOT NULL THEN 1 ELSE 0 END AS is_pinned
       FROM connections c
       INNER JOIN workspace_members wm ON wm.workspace_id = c.workspace_id AND wm.user_id = ?
       INNER JOIN workspaces w ON w.id = c.workspace_id
       LEFT JOIN pinned_connections p ON p.connection_id = c.id AND p.user_id = ?
       ORDER BY is_pinned DESC, c.updated_at DESC`,
    )
    .all(user.id, user.id) as { id: string; is_pinned: number }[];

  const allConnections = attachHostInfoSummary(
    getDb(),
    attachMethods(connectionRows as Parameters<typeof attachMethods>[0]),
  ) as ConnectionItem[];

  const pinnedIds = new Set(
    connectionRows.filter((row) => row.is_pinned === 1).map((row) => row.id),
  );

  const displayName =
    "displayName" in user && user.displayName ? user.displayName : user.email.split("@")[0];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title={`Welcome back${displayName ? `, ${displayName}` : ""}`}
        description="Monitor the Wyvern host, jump into saved connections, and pick up recent sessions."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ServerStatsPanel className="lg:col-span-2" />
        <DashboardOverview
          connectionCount={allConnections.length}
          activeSessionCount={activeSessions.length}
          pinnedCount={pinnedIds.size}
          workspaceCount={workspaces.length}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        <div className="lg:col-span-2 space-y-6">
          <DashboardConnections connections={allConnections} pinnedIds={pinnedIds} />
          <ReplayCenter />
        </div>
        <div className="space-y-6">
          <ConnectionHistory
            activeItems={activeSessions as Parameters<typeof ConnectionHistory>[0]["activeItems"]}
            recentItems={recentHistory as Parameters<typeof ConnectionHistory>[0]["recentItems"]}
          />
        </div>
      </div>
    </div>
  );
}
