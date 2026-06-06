import { Card, CardContent } from "@/components/ui/card";
import { Activity, FolderOpen, Pin, Plug } from "lucide-react";

interface DashboardOverviewProps {
  connectionCount: number;
  activeSessionCount: number;
  pinnedCount: number;
  workspaceCount: number;
}

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="text-xs text-muted">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardOverview({
  connectionCount,
  activeSessionCount,
  pinnedCount,
  workspaceCount,
}: DashboardOverviewProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      <StatTile label="Connections" value={connectionCount} icon={Plug} />
      <StatTile label="Active sessions" value={activeSessionCount} icon={Activity} />
      <StatTile label="Pinned" value={pinnedCount} icon={Pin} />
      <StatTile label="Workspaces" value={workspaceCount} icon={FolderOpen} />
    </div>
  );
}
