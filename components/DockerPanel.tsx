"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Square, RotateCcw, FileText, Terminal, RefreshCw, X } from "lucide-react";

interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  cpu: string;
  memory: string;
  mem_perc: string;
  net: string;
  block: string;
}

interface DockerPanelProps {
  connectionId: string;
  onAttachTerminal: (containerId: string, name: string) => void;
  onClose?: () => void;
}

export function DockerPanel({ connectionId, onAttachTerminal, onClose }: DockerPanelProps) {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Logs states
  const [logContainer, setLogContainer] = useState<{ id: string; name: string } | null>(null);
  const [logsText, setLogsText] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchContainers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/connections/${connectionId}/docker`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load containers");
      }
      const data = await res.json();
      setContainers(data.containers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load containers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchContainers();
  }, [connectionId]);

  const handleAction = async (containerId: string, action: "start" | "stop" | "restart") => {
    setActionLoading(`${containerId}-${action}`);
    setError("");
    try {
      const res = await fetch(`/api/connections/${connectionId}/docker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, containerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} container`);
      }
      await fetchContainers();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} container`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewLogs = async (containerId: string, name: string) => {
    setLogContainer({ id: containerId, name });
    setLogsLoading(true);
    setLogsText("");
    try {
      const res = await fetch(`/api/connections/${connectionId}/docker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logs", containerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch logs");
      }
      const data = await res.json();
      setLogsText(data.output || "No log output.");
    } catch (err) {
      setLogsText(`Error: ${err instanceof Error ? err.message : "Failed to load logs"}`);
    } finally {
      setLogsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 p-4 text-zinc-100 min-h-0">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Docker Management</h3>
          <p className="text-xs text-zinc-500">Manage containers on target host</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
            onClick={() => void fetchContainers()}
            disabled={loading}
            title="Refresh list"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
              onClick={onClose}
              title="Close panel"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-950/20 border border-red-900/50 p-2.5 text-xs text-red-400 shrink-0">
          {error}
        </div>
      )}

      {loading && containers.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-zinc-500 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          <span className="text-xs">Connecting to Docker engine...</span>
        </div>
      ) : containers.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">
          No containers found.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1 scrollbar-thin">
          {containers.map((c) => {
            const isRunning = c.state === "running";
            return (
              <div
                key={c.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/20 p-3 hover:border-zinc-750 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          isRunning ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-zinc-650"
                        }`}
                      />
                      <span className="truncate text-xs font-medium text-zinc-200" title={c.name}>
                        {c.name}
                      </span>
                    </div>
                    <p className="truncate text-[10px] text-zinc-500 mt-0.5" title={c.image}>
                      {c.image}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isRunning ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-350 hover:bg-red-950/20"
                          onClick={() => void handleAction(c.id, "stop")}
                          disabled={actionLoading !== null}
                          title="Stop Container"
                        >
                          {actionLoading === `${c.id}-stop` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Square className="h-3.5 w-3.5 fill-red-400/20" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-amber-450 hover:text-amber-400 hover:bg-amber-950/20"
                          onClick={() => void handleAction(c.id, "restart")}
                          disabled={actionLoading !== null}
                          title="Restart Container"
                        >
                          {actionLoading === `${c.id}-restart` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
                          onClick={() => onAttachTerminal(c.id, c.name)}
                          disabled={actionLoading !== null}
                          title="Attach Terminal"
                        >
                          <Terminal className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-emerald-450 hover:text-emerald-400 hover:bg-emerald-950/20"
                        onClick={() => void handleAction(c.id, "start")}
                        disabled={actionLoading !== null}
                        title="Start Container"
                      >
                        {actionLoading === `${c.id}-start` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5 fill-emerald-400/20" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
                      onClick={() => void handleViewLogs(c.id, c.name)}
                      disabled={actionLoading !== null}
                      title="View Logs"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isRunning && (
                  <div className="mt-2.5 pt-2.5 border-t border-zinc-800 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-zinc-400">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">CPU</span>
                      <span className="font-mono text-zinc-300">{c.cpu}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Memory</span>
                      <span className="font-mono text-zinc-300" title={c.memory}>
                        {c.mem_perc}
                      </span>
                    </div>
                    <div className="flex justify-between col-span-2">
                      <span className="text-zinc-500">Network I/O</span>
                      <span className="font-mono text-zinc-300 truncate max-w-[150px]">{c.net}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Logs View Overlay Modal */}
      {logContainer && (
        <div className="absolute inset-0 z-30 flex flex-col bg-zinc-950 p-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3 shrink-0">
            <div>
              <span className="text-xs font-semibold text-zinc-200">Logs: {logContainer.name}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-200"
              onClick={() => setLogContainer(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 bg-zinc-900 border border-zinc-800 rounded-md p-3 overflow-auto font-mono text-[10px] text-zinc-300 whitespace-pre-wrap select-text">
            {logsLoading ? (
              <div className="flex h-full items-center justify-center text-zinc-500 gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading logs...
              </div>
            ) : (
              logsText
            )}
          </div>
        </div>
      )}
    </div>
  );
}
