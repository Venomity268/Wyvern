"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRam, formatStorage, formatUptime, utilColor } from "@/components/host-metrics/format";
import type { ServerStats } from "@/lib/server-stats/types";
import { APP_NAME } from "@/lib/brand";
import { Cpu, HardDrive, Loader2, MemoryStick, Server } from "lucide-react";
import { cn } from "@/lib/utils";

const POLL_MS = 30_000;

function MetricBar({
  label,
  value,
  text,
  icon: Icon,
}: {
  label: string;
  value: number | null | undefined;
  text: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const pct = value ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <span className="font-mono text-xs text-muted-foreground">{text}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-accent">
        <div
          className={cn("h-full rounded-full transition-all duration-500", utilColor(pct))}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

export function ServerStatsPanel({ className }: { className?: string }) {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/server/stats");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load server stats");
        return;
      }
      setStats(data.stats as ServerStats);
      setError("");
    } catch {
      setError("Failed to load server stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-primary" />
              {APP_NAME} host
            </CardTitle>
            <p className="mt-1 text-sm text-muted">
              System resources on the machine running this instance.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted">
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            Live · 30s
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {stats ?
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{stats.hostname}</Badge>
              <Badge variant="outline">
                {stats.platform} {stats.release}
              </Badge>
              <Badge variant="outline">{stats.arch}</Badge>
              <Badge variant="outline">{stats.node_version}</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <MetricBar
                label="CPU"
                icon={Cpu}
                value={stats.cpu_util_pct}
                text={
                  stats.cpu_util_pct !== null ?
                    `${stats.cpu_util_pct}% · ${stats.cpu_count} cores`
                  : `${stats.cpu_count} cores`
                }
              />
              <MetricBar
                label="Memory"
                icon={MemoryStick}
                value={stats.memory_util_pct}
                text={formatRam(stats.memory_used_mb, stats.memory_total_mb)}
              />
              <MetricBar
                label="Storage"
                icon={HardDrive}
                value={stats.disk_util_pct}
                text={formatStorage(stats.disk_used_gb, stats.disk_total_gb)}
              />
              <div className="rounded-lg border border-border bg-accent/40 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Uptime</p>
                <p className="mt-1 font-mono text-sm text-foreground">
                  {formatUptime(stats.uptime_seconds)}
                </p>
                {stats.load_avg && (
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    Load {stats.load_avg.join(" · ")}
                  </p>
                )}
              </div>
            </div>

            {stats.cpu_model && (
              <p className="truncate text-xs text-muted-foreground">{stats.cpu_model}</p>
            )}
          </>
        : loading ?
          <p className="text-sm text-muted">Collecting host metrics…</p>
        : null}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
