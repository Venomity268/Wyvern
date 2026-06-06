"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Play,
  Square,
  RotateCcw,
  Terminal,
  RefreshCw,
  X,
  Layers,
  Box,
  Cpu,
  Info,
  ChevronDown,
  ChevronRight,
  Activity,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  compose_project?: string;
  compose_service?: string;
  stack_namespace?: string;
}

interface DockerPanelProps {
  connectionId: string;
  onAttachTerminal: (containerId: string, name: string) => void;
  onClose?: () => void;
}

function parsePercentage(val?: string): number {
  if (!val) return 0;
  const num = parseFloat(val.replace(/%/g, ""));
  return isNaN(num) ? 0 : num;
}

function MetricBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center justify-between text-[9px] text-zinc-500 font-mono">
        <span>{label}</span>
        <span>{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            value > 85 ? "bg-destructive" : value > 50 ? "bg-amber-500" : "bg-emerald-500"
          )}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

export function DockerPanel({ connectionId, onAttachTerminal, onClose }: DockerPanelProps) {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"stacks" | "standalone">("stacks");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedStacks, setExpandedStacks] = useState<Record<string, boolean>>({});

  // Container details panel state
  const [detailsContainer, setDetailsContainer] = useState<Container | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState<"logs" | "inspect" | "processes">("logs");
  const [detailsContent, setDetailsContent] = useState("");
  const [detailsLoading, setDetailsLoading] = useState(false);

  const fetchContainers = useCallback(async () => {
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
  }, [connectionId]);

  useEffect(() => {
    void fetchContainers();
  }, [fetchContainers]);

  const handleContainerAction = async (containerId: string, action: "start" | "stop" | "restart") => {
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

  const handleStackAction = async (stackName: string, action: "start-stack" | "stop-stack" | "restart-stack") => {
    setActionLoading(`${stackName}-${action}`);
    setError("");
    try {
      const res = await fetch(`/api/connections/${connectionId}/docker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, containerId: stackName }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to perform ${action} on stack`);
      }
      await fetchContainers();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to perform ${action} on stack`);
    } finally {
      setActionLoading(null);
    }
  };

  // Fetch drawer details (Logs, Inspect, Processes)
  useEffect(() => {
    if (!detailsContainer) return;

    const fetchDetails = async () => {
      setDetailsLoading(true);
      setDetailsContent("");
      try {
        const action = activeDetailsTab === "processes" ? "top" : activeDetailsTab;
        const res = await fetch(`/api/connections/${connectionId}/docker`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, containerId: detailsContainer.id }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `Failed to fetch container ${activeDetailsTab}`);
        }
        const data = await res.json();
        if (activeDetailsTab === "inspect") {
          try {
            const parsed = JSON.parse(data.output);
            setDetailsContent(JSON.stringify(parsed, null, 2));
          } catch {
            setDetailsContent(data.output || "No configuration structure returned.");
          }
        } else {
          setDetailsContent(data.output || "No data.");
        }
      } catch (err) {
        setDetailsContent(`Error: ${err instanceof Error ? err.message : "Fetch operation failed"}`);
      } finally {
        setDetailsLoading(false);
      }
    };

    void fetchDetails();
  }, [detailsContainer, activeDetailsTab, connectionId]);

  // Grouping logic
  const stacks: Record<string, Container[]> = {};
  const standalone: Container[] = [];

  containers.forEach((c) => {
    const stackName = c.compose_project || c.stack_namespace;
    if (stackName) {
      if (!stacks[stackName]) {
        stacks[stackName] = [];
      }
      stacks[stackName].push(c);
    } else {
      standalone.push(c);
    }
  });

  const toggleStack = (name: string) => {
    setExpandedStacks((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const renderContainerRow = (c: Container, nested = false) => {
    const isRunning = c.state === "running";
    const statusText = c.status || (isRunning ? "Running" : "Stopped");

    return (
      <div
        key={c.id}
        className={cn(
          "flex flex-col gap-2.5 rounded-lg border border-border bg-card/40 p-3 hover:border-zinc-700 transition-colors",
          nested && "ml-4 border-l-2 border-l-primary/30"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  isRunning ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-muted-foreground"
                )}
              />
              <span className="truncate text-xs font-semibold text-foreground" title={c.name}>
                {c.name}
              </span>
              {c.compose_service && (
                <Badge variant="secondary" className="font-mono text-[9px] px-1.5 py-0">
                  {c.compose_service}
                </Badge>
              )}
            </div>
            <p className="truncate text-[10px] text-muted-foreground mt-0.5" title={c.image}>
              {c.image}
            </p>
            {c.ports && (
              <p className="truncate text-[9px] font-mono text-zinc-500 mt-1" title={c.ports}>
                🔌 {c.ports}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isRunning ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  onClick={() => void handleContainerAction(c.id, "stop")}
                  disabled={actionLoading !== null}
                  title="Stop Container"
                >
                  {actionLoading === `${c.id}-stop` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Square className="h-3.5 w-3.5 fill-current" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-amber-500 hover:bg-amber-500/10"
                  onClick={() => void handleContainerAction(c.id, "restart")}
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
                  size="icon"
                  className="h-7 w-7 text-primary hover:bg-primary/10"
                  onClick={() => onAttachTerminal(c.id, c.name)}
                  disabled={actionLoading !== null}
                  title="Attach Exec Shell"
                >
                  <Terminal className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10"
                onClick={() => void handleContainerAction(c.id, "start")}
                disabled={actionLoading !== null}
                title="Start Container"
              >
                {actionLoading === `${c.id}-start` ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted hover:bg-zinc-800 hover:text-foreground"
              onClick={() => {
                setDetailsContainer(c);
                setActiveDetailsTab("logs");
              }}
              disabled={actionLoading !== null}
              title="Container details (Logs/Config)"
            >
              <Info className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {isRunning && (
          <div className="mt-1.5 pt-2 border-t border-border grid grid-cols-2 gap-3">
            <MetricBar label="CPU" value={parsePercentage(c.cpu)} />
            <MetricBar label="Memory" value={parsePercentage(c.mem_perc)} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-background p-4 text-foreground min-h-0 relative">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3 mb-4 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Docker Management</h3>
          <p className="text-xs text-muted">Manage containers and stacks on the remote connection</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted hover:text-foreground"
            onClick={() => void fetchContainers()}
            disabled={loading}
            title="Refresh list"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted hover:text-foreground"
              onClick={onClose}
              title="Close panel"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/30 p-2.5 text-xs text-destructive shrink-0">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2 mb-4 shrink-0">
        <Button
          variant={activeTab === "stacks" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
          onClick={() => setActiveTab("stacks")}
        >
          <Layers className="h-3.5 w-3.5" />
          Compose Stacks ({Object.keys(stacks).length})
        </Button>
        <Button
          variant={activeTab === "standalone" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
          onClick={() => setActiveTab("standalone")}
        >
          <Box className="h-3.5 w-3.5" />
          Standalone ({standalone.length})
        </Button>
      </div>

      {/* Main List Area */}
      {loading && containers.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-muted gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
          <span className="text-xs font-mono">Connecting to Docker engine...</span>
        </div>
      ) : containers.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted">
          No Docker containers detected on host.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 min-h-0 pr-1 scrollbar-thin">
          {activeTab === "stacks" ? (
            Object.keys(stacks).length === 0 ? (
              <div className="flex h-32 items-center justify-center text-xs text-muted">
                No active compose stacks found.
              </div>
            ) : (
              Object.entries(stacks).map(([stackName, stackContainers]) => {
                const totalCount = stackContainers.length;
                const runningContainers = stackContainers.filter((c) => c.state === "running");
                const runningCount = runningContainers.length;
                const isExpanded = expandedStacks[stackName] ?? true;

                // Calculate aggregates
                const avgCpu = runningContainers.reduce((sum, c) => sum + parsePercentage(c.cpu), 0);
                const avgMem = runningContainers.reduce((sum, c) => sum + parsePercentage(c.mem_perc), 0);

                // Stack Status
                const allRunning = runningCount === totalCount;
                const noneRunning = runningCount === 0;
                const statusColor = allRunning ? "bg-emerald-500" : noneRunning ? "bg-muted-foreground" : "bg-amber-500";

                return (
                  <Card key={stackName} className="border-border bg-card/30 overflow-hidden">
                    <div className="flex flex-col gap-3 p-3 bg-accent/30 sm:flex-row sm:items-center sm:justify-between border-b border-border">
                      <div className="flex items-center gap-2 min-w-0 cursor-pointer" onClick={() => toggleStack(stackName)}>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted shrink-0" />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", statusColor)} />
                            <h4 className="font-semibold text-xs truncate text-foreground">
                              {stackName}
                            </h4>
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono">
                              {runningCount}/{totalCount} up
                            </Badge>
                          </div>
                          {runningCount > 0 && (
                            <div className="flex gap-3 mt-1 text-[9px] text-muted-foreground font-mono">
                              <span className="flex items-center gap-1">
                                <Cpu className="h-3 w-3" /> CPU: {avgCpu.toFixed(1)}%
                              </span>
                              <span className="flex items-center gap-1">
                                <Activity className="h-3 w-3" /> Mem: {avgMem.toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 text-emerald-500 hover:bg-emerald-500/10"
                          onClick={() => void handleStackAction(stackName, "start-stack")}
                          disabled={actionLoading !== null}
                          title="Start entire stack"
                        >
                          {actionLoading === `${stackName}-start-stack` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3 mr-1 fill-current" />
                          )}
                          Start
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 text-destructive hover:bg-destructive/10"
                          onClick={() => void handleStackAction(stackName, "stop-stack")}
                          disabled={actionLoading !== null}
                          title="Stop entire stack"
                        >
                          {actionLoading === `${stackName}-stop-stack` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Square className="h-3 w-3 mr-1 fill-current" />
                          )}
                          Stop
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 text-amber-500 hover:bg-amber-500/10"
                          onClick={() => void handleStackAction(stackName, "restart-stack")}
                          disabled={actionLoading !== null}
                          title="Restart entire stack"
                        >
                          {actionLoading === `${stackName}-restart-stack` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3 mr-1" />
                          )}
                          Restart
                        </Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <CardContent className="p-3 space-y-3 divide-y divide-border/45">
                        {stackContainers.map((c) => renderContainerRow(c, true))}
                      </CardContent>
                    )}
                  </Card>
                );
              })
            )
          ) : standalone.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-muted">
              No standalone containers running.
            </div>
          ) : (
            <div className="space-y-3">{standalone.map((c) => renderContainerRow(c, false))}</div>
          )}
        </div>
      )}

      {/* Logs/Inspect Overlay Panel */}
      {detailsContainer && (
        <div className="absolute inset-0 z-30 flex flex-col bg-background p-4 animate-fadeIn border border-border rounded-lg shadow-2xl">
          <div className="flex items-center justify-between border-b border-border pb-3 mb-4 shrink-0">
            <div>
              <span className="text-xs font-semibold text-foreground">Container details:</span>
              <h4 className="text-sm font-bold text-foreground mt-0.5">{detailsContainer.name}</h4>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted hover:text-foreground"
              onClick={() => setDetailsContainer(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Modal Tabs */}
          <div className="flex gap-1.5 border-b border-border pb-2 mb-4 shrink-0 text-xs">
            <Button
              variant={activeDetailsTab === "logs" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setActiveDetailsTab("logs")}
            >
              <FileText className="h-3.5 w-3.5" />
              Logs (tail)
            </Button>
            <Button
              variant={activeDetailsTab === "inspect" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setActiveDetailsTab("inspect")}
            >
              <Info className="h-3.5 w-3.5" />
              Inspect Config
            </Button>
            <Button
              variant={activeDetailsTab === "processes" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setActiveDetailsTab("processes")}
            >
              <Activity className="h-3.5 w-3.5" />
              Processes (top)
            </Button>
          </div>

          {/* Details Content Viewer */}
          <div className="flex-1 min-h-0 bg-zinc-950 border border-border rounded-lg p-3 overflow-auto font-mono text-[10px] text-zinc-300 whitespace-pre scrollbar-thin select-text">
            {detailsLoading ? (
              <div className="flex h-full items-center justify-center text-muted gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted" />
                Loading {activeDetailsTab}...
              </div>
            ) : (
              detailsContent
            )}
          </div>
        </div>
      )}
    </div>
  );
}
