"use client";

import { Loader2, X } from "lucide-react";
import type { HostMetricsDetail } from "@/lib/host-info/types";
import { Button } from "@/components/ui/button";
import { MiniStat, Sparkline, UtilBar } from "./charts";
import { formatRam, formatStorage, formatUptime } from "./format";

interface HostMetricsDetailPanelProps {
  connectionName: string;
  metrics: HostMetricsDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onRefresh: () => void;
}

export function HostMetricsDetailPanel({
  connectionName,
  metrics,
  loading,
  error,
  onClose,
  onRefresh,
}: HostMetricsDetailPanelProps) {
  const osLabel =
    metrics?.os_name ?
      [metrics.os_name, metrics.os_version].filter(Boolean).join(" ")
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-xl border border-zinc-700 bg-zinc-900 shadow-2xl sm:rounded-xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">{connectionName}</h2>
            <p className="text-xs text-zinc-500">
              {osLabel || metrics?.fqdn || "System metrics"}
              {metrics?.collected_at ?
                ` · updated ${new Date(metrics.collected_at).toLocaleTimeString()}`
              : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-zinc-400"
              disabled={loading}
              onClick={onRefresh}
            >
              {loading ?
                <Loader2 className="h-4 w-4 animate-spin" />
              : "Refresh"}
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {metrics?.collection_error && (
            <p className="text-sm text-amber-400">{metrics.collection_error}</p>
          )}

          {!metrics ?
            <p className="text-sm text-zinc-500">Collecting metrics…</p>
          : <>
              <section className="space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Utilization
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <UtilBar
                    label="CPU"
                    value={metrics.cpu_util_pct}
                    caption={
                      metrics.load_avg ?
                        `Load ${metrics.load_avg.map((v) => v.toFixed(2)).join(" · ")}`
                      : undefined
                    }
                  />
                  <UtilBar
                    label="Memory"
                    value={metrics.memory_util_pct}
                    caption={formatRam(metrics.memory_used_mb, metrics.memory_total_mb)}
                  />
                  <UtilBar
                    label="Disk"
                    value={metrics.disk_util_pct}
                    caption={formatStorage(metrics.disk_used_gb, metrics.disk_total_gb)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Sparkline data={metrics.history} field="cpu_util_pct" label="CPU history" color="#60a5fa" />
                  <Sparkline data={metrics.history} field="memory_util_pct" label="Memory history" color="#34d399" />
                  <Sparkline data={metrics.history} field="disk_util_pct" label="Disk history" color="#a78bfa" />
                  <Sparkline
                    data={metrics.history}
                    field="load_avg_1"
                    label="Load (1m)"
                    color="#fbbf24"
                    formatValue={(v) => v.toFixed(2)}
                  />
                </div>
              </section>

              <section className="grid gap-2 sm:grid-cols-4">
                <MiniStat label="Uptime" value={formatUptime(metrics.uptime_seconds)} />
                <MiniStat label="CPUs" value={metrics.cpu_count?.toString() ?? "—"} />
                <MiniStat
                  label="Network ↓"
                  value={metrics.network_rx_mb !== null ? `${metrics.network_rx_mb} MB` : "—"}
                />
                <MiniStat
                  label="Network ↑"
                  value={metrics.network_tx_mb !== null ? `${metrics.network_tx_mb} MB` : "—"}
                />
              </section>

              {metrics.cpu_model && (
                <p className="text-xs text-zinc-500">
                  {metrics.cpu_model}
                  {metrics.kernel ? ` · ${metrics.kernel}` : ""}
                </p>
              )}

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Top processes
                </h3>
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead className="bg-zinc-950/80 text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">PID</th>
                        <th className="px-3 py-2 font-medium">User</th>
                        <th className="px-3 py-2 font-medium">CPU</th>
                        <th className="px-3 py-2 font-medium">MEM</th>
                        <th className="px-3 py-2 font-medium">Command</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.processes.length === 0 ?
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-zinc-600">
                            No process data
                          </td>
                        </tr>
                      : metrics.processes.map((proc) => (
                          <tr key={proc.pid} className="border-t border-zinc-800/80">
                            <td className="px-3 py-1.5 font-mono text-zinc-400">{proc.pid}</td>
                            <td className="px-3 py-1.5 text-zinc-300">{proc.user}</td>
                            <td className="px-3 py-1.5 font-mono text-sky-300">{proc.cpu_pct.toFixed(1)}%</td>
                            <td className="px-3 py-1.5 font-mono text-emerald-300">{proc.mem_pct.toFixed(1)}%</td>
                            <td className="max-w-[200px] truncate px-3 py-1.5 text-zinc-200">{proc.command}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    User services
                  </h3>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800">
                    {metrics.user_services.length === 0 ?
                      <p className="px-3 py-4 text-xs text-zinc-600">No running user services</p>
                    : metrics.user_services.map((svc) => (
                        <div
                          key={svc.name}
                          className="border-b border-zinc-800/80 px-3 py-2 last:border-0"
                        >
                          <p className="truncate text-xs font-medium text-zinc-200">{svc.name}</p>
                          <p className="text-[10px] text-emerald-400">{svc.state}</p>
                          {svc.description && (
                            <p className="truncate text-[10px] text-zinc-600">{svc.description}</p>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Listening ports
                  </h3>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800">
                    {metrics.listening_ports.length === 0 ?
                      <p className="px-3 py-4 text-xs text-zinc-600">No port data</p>
                    : metrics.listening_ports.map((port, i) => (
                        <div
                          key={`${port.protocol}-${port.port}-${i}`}
                          className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-3 py-2 last:border-0"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-zinc-200">
                              {port.protocol.toUpperCase()} :{port.port}
                            </p>
                            <p className="truncate text-[10px] text-zinc-600">{port.address}</p>
                          </div>
                          <span className="shrink-0 truncate text-[10px] text-zinc-500">
                            {port.process || "—"}
                          </span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </section>
            </>
          }
        </div>
      </div>
    </div>
  );
}
