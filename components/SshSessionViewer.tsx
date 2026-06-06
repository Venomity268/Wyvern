"use client";

import React, { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle, type Layout } from "react-resizable-panels";
import { X, Plus, Terminal, Keyboard } from "lucide-react";
import { SessionLayout } from "@/components/SessionLayout";
import { SplitPane } from "@/components/SplitPane";
import {
  SshTerminal,
  type SshTerminalHandle,
} from "@/components/SshTerminal";
import { SshToolbar, SshPastePanel } from "@/components/SshToolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PortForwardPanel } from "@/components/PortForwardPanel";
import { FileManagerPanel } from "@/components/file-manager/FileManagerPanel";
import { DockerPanel } from "@/components/DockerPanel";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useIsTouchDevice } from "@/lib/hooks/useIsTouchDevice";
import { usePreventBackspaceNavigation } from "@/lib/hooks/usePreventBackspaceNavigation";
import { useDisconnectOnLeave } from "@/lib/hooks/useDisconnectOnLeave";
import {
  useSessionStore,
  type LayoutNode,
  collectAllIds,
  collectTerminalLeaves,
} from "@/lib/store/sessionStore";

interface PaneRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PaneSessionProps {
  connectionId?: string;
  quickSessionId?: string;
  connectionName: string;
  hostname: string;
  defaultUsername?: string | null;
  hasStoredCredential: boolean;
  terminalRefs: React.RefObject<Map<string, SshTerminalHandle>>;
  sessionCredentials: {
    username: string;
    password?: string;
    privateKey?: string;
  } | null;
  updateTabState: (id: string, state: Record<string, unknown>) => void;
  clearTabState: (id: string) => void;
  resetSidePanels: () => void;
  onDockerAttach: (paneId: string, containerId: string, containerName: string) => void;
  onTerminalSlotMount: (paneId: string, el: HTMLDivElement | null) => void;
}

interface SshSessionViewerProps {
  connectionId?: string;
  quickSessionId?: string;
  connectionName: string;
  hostname: string;
  defaultUsername?: string | null;
  hasStoredCredential: boolean;
  chromeless?: boolean;
}

type SidePanel = "none" | "ports" | "sftp" | "docker";

function findPaneIdByType(node: LayoutNode, type: "terminal" | "docker" | "files"): string | null {
  if (node.type === "leaf") {
    return node.componentType === type ? node.id : null;
  }
  for (const child of node.children) {
    const found = findPaneIdByType(child, type);
    if (found) return found;
  }
  return null;
}

function PaneTerminalSlot({
  paneId,
  onMount,
}: {
  paneId: string;
  onMount: (paneId: string, el: HTMLDivElement | null) => void;
}) {
  const onMountRef = useRef(onMount);
  onMountRef.current = onMount;

  useEffect(() => {
    return () => onMountRef.current(paneId, null);
  }, [paneId]);

  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      onMountRef.current(paneId, el);
    },
    [paneId],
  );

  return <div ref={ref} className="flex-1 min-h-0 min-w-0" data-terminal-slot={paneId} />;
}

const StableTerminalInstance = React.memo(function StableTerminalInstance({
  paneId,
  execCommand,
  terminalRefs,
  connectionId,
  quickSessionId,
  connectionName,
  hostname,
  defaultUsername,
  hasStoredCredential,
  autoFocusOnConnect,
  updateTabState,
  clearTabState,
  resetSidePanels,
}: {
  paneId: string;
  execCommand?: string;
  terminalRefs: React.RefObject<Map<string, SshTerminalHandle>>;
  connectionId?: string;
  quickSessionId?: string;
  connectionName: string;
  hostname: string;
  defaultUsername?: string | null;
  hasStoredCredential: boolean;
  autoFocusOnConnect?: boolean;
  updateTabState: (id: string, state: Record<string, unknown>) => void;
  clearTabState: (id: string) => void;
  resetSidePanels: () => void;
}) {
  return (
    <SshTerminal
      ref={(el) => {
        if (el) {
          terminalRefs.current?.set(paneId, el);
        } else {
          terminalRefs.current?.delete(paneId);
        }
      }}
      connectionId={connectionId}
      quickSessionId={quickSessionId}
      connectionName={connectionName}
      hostname={hostname}
      defaultUsername={defaultUsername}
      hasStoredCredential={hasStoredCredential}
      execCommand={execCommand}
      variant="embedded"
      chromeless
      paneVisible
      autoFocusOnConnect={autoFocusOnConnect}
      reportSessionEnd={paneId === "main"}
      onStateChange={(state) => {
        updateTabState(paneId, { sessionState: state });
      }}
      onAuthenticated={(creds) => {
        updateTabState(paneId, { sessionCredentials: creds });
      }}
      onWebSocketReady={(ws) => {
        updateTabState(paneId, { shellWs: ws });
      }}
      onWebSocketClose={() => {
        updateTabState(paneId, { shellWs: null });
      }}
      onDisconnect={() => {
        if (paneId === "main") {
          resetSidePanels();
        } else {
          clearTabState(paneId);
        }
      }}
    />
  );
});

const PaneLayout = ({
  node,
  activePaneId,
  setActivePaneId,
  onSplit,
  onClosePane,
  activeTabId,
  mergeTab,
  session,
}: {
  node: LayoutNode;
  activePaneId: string;
  setActivePaneId: (id: string) => void;
  onSplit: (
    targetId: string,
    direction: "horizontal" | "vertical",
    execCommand?: string,
    title?: string,
    componentType?: "terminal" | "docker" | "files"
  ) => void;
  onClosePane: (targetId: string) => void;
  activeTabId: string;
  mergeTab: (sourceTabId: string, targetTabId: string, targetPaneId?: string) => void;
  session: PaneSessionProps;
}) => {
  const updateSplitSizes = useSessionStore((state) => state.updateSplitSizes);
  const reconnectKey = useSessionStore((state) => state.reconnectKey);

  const branchChildIds =
    node.type === "branch" ? node.children.map((child) => child.id).join(",") : "";
  const branchId = node.type === "branch" ? node.id : "";
  const defaultLayout = useMemo((): Layout | undefined => {
    if (node.type !== "branch") return undefined;
    const layout: Layout = {};
    node.children.forEach((child, index) => {
      layout[child.id] = node.sizes?.[index] ?? 100 / node.children.length;
    });
    return layout;
    // Intentionally omit node.sizes — layout is owned by PanelGroup after mount.
  }, [branchId, branchChildIds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (node.type === "leaf") {
    const isActive = node.id === activePaneId;

    return (
      <div
        id={`pane-${node.id}`}
        className={cn(
          "relative flex h-full min-h-0 w-full min-w-0 flex-col rounded-md border transition-colors duration-150",
          isActive ?
            "border-primary/35 bg-background shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)]"
          : "border-border/60 bg-background/70 hover:border-border",
        )}
        onClickCapture={() => setActivePaneId(node.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const draggedTabId = e.dataTransfer.getData("text/tab-id");
          if (draggedTabId) {
            mergeTab(draggedTabId, activeTabId, node.id);
          }
        }}
      >
        <div
          className={cn(
            "flex shrink-0 select-none items-center justify-between border-b px-2 py-1 text-[10px] transition-colors",
            isActive ?
              "border-border bg-card/70 text-muted-foreground"
            : "border-transparent bg-transparent text-muted",
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="font-medium uppercase tracking-wide text-muted">
              {node.componentType}
            </span>
            {node.title !== node.componentType && (
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {node.title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSplit(node.id, "horizontal");
              }}
              className="touch-target inline-flex h-8 w-8 items-center justify-center leading-none hover:text-foreground"
              title="Split horizontally"
            >
              ◧
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSplit(node.id, "vertical");
              }}
              className="touch-target inline-flex h-8 w-8 items-center justify-center leading-none hover:text-foreground"
              title="Split vertically"
            >
              ◫
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClosePane(node.id);
              }}
              className="touch-target inline-flex h-8 w-8 items-center justify-center text-destructive hover:text-destructive/80"
              title="Close pane"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Active Component Core */}
        <div className="flex-1 min-h-0 relative flex flex-col">
          {node.componentType === "terminal" && (
            <PaneTerminalSlot
              paneId={node.id}
              onMount={session.onTerminalSlotMount}
            />
          )}
          {node.componentType === "files" && (
            <FileManagerPanel
              key={`files-${session.connectionId || session.quickSessionId}-${reconnectKey}-${node.id}`}
              connectionId={session.connectionId}
              quickSessionId={session.quickSessionId}
              defaultUsername={session.defaultUsername}
              hasStoredCredential={session.hasStoredCredential}
              sessionAuth={session.sessionCredentials}
              onClose={() => onClosePane(node.id)}
            />
          )}
          {node.componentType === "docker" && (
            session.connectionId ? (
              <DockerPanel
                connectionId={session.connectionId}
                onAttachTerminal={(containerId, containerName) => {
                  session.onDockerAttach(node.id, containerId, containerName);
                }}
                onClose={() => onClosePane(node.id)}
              />
            ) : (
              <div className="p-4 text-zinc-400 text-xs font-mono">Docker requires a saved connection.</div>
            )
          )}
        </div>
      </div>
    );
  }

  const direction = node.direction;

  return (
    <PanelGroup
      id={node.id}
      orientation={direction}
      className="h-full w-full"
      defaultLayout={defaultLayout}
      onLayoutChanged={(layout: Layout) => {
        const sizes = node.children.map(
          (child) => layout[child.id] ?? (node.sizes?.[node.children.indexOf(child)] ?? 100 / node.children.length)
        );
        updateSplitSizes(node.id, sizes);
      }}
    >
      {node.children.flatMap((child, index) => {
        const result = [
          <Panel key={child.id} id={child.id} minSize={10}>
            <PaneLayout
              node={child}
              activePaneId={activePaneId}
              setActivePaneId={setActivePaneId}
              onSplit={onSplit}
              onClosePane={onClosePane}
              activeTabId={activeTabId}
              mergeTab={mergeTab}
              session={session}
            />
          </Panel>,
        ];

        if (index < node.children.length - 1) {
          result.push(
            <PanelResizeHandle
              key={`${child.id}-resize`}
              className={`bg-zinc-900 shrink-0 ${
                direction === "horizontal"
                  ? "w-1 h-full mx-0.5"
                  : "h-1 w-full my-0.5"
              }`}
            />
          );
        }

        return result;
      })}
    </PanelGroup>
  );
};

export function SshSessionViewer({
  connectionId,
  quickSessionId,
  connectionName,
  hostname,
  defaultUsername,
  hasStoredCredential,
  chromeless = false,
}: SshSessionViewerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const terminalRefs = useRef<Map<string, SshTerminalHandle>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const slotElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const slotObserversRef = useRef<Map<string, ResizeObserver>>(new Map());
  const [paneRects, setPaneRects] = useState<Record<string, PaneRect>>({});
  const isMobile = useIsMobile();
  const isTouchDevice = useIsTouchDevice();

  // Central store layout selectors
  const initializeStore = useSessionStore((state) => state.initialize);
  useEffect(() => {
    initializeStore(hasStoredCredential);
  }, [hasStoredCredential, initializeStore]);

  const tabs = useSessionStore((state) => state.tabs);
  const activeTabId = useSessionStore((state) => state.activeTabId);
  const activePaneId = useSessionStore((state) => state.activePaneId);
  const tabStates = useSessionStore((state) => state.tabStates);
  const reconnectKey = useSessionStore((state) => state.reconnectKey);

  const terminalPanes = useMemo(
    () =>
      tabs.flatMap((tab) =>
        collectTerminalLeaves(tab.layout).map((pane) => ({ ...pane, tabId: tab.id })),
      ),
    [tabs],
  );

  const updatePaneRect = useCallback((paneId: string) => {
    const el = slotElementsRef.current.get(paneId);
    const viewport = viewportRef.current;
    if (!el || !viewport) return;

    const slotRect = el.getBoundingClientRect();
    const vpRect = viewport.getBoundingClientRect();
    const next: PaneRect = {
      left: slotRect.left - vpRect.left,
      top: slotRect.top - vpRect.top,
      width: slotRect.width,
      height: slotRect.height,
    };

    setPaneRects((prev) => {
      const current = prev[paneId];
      if (
        current &&
        current.left === next.left &&
        current.top === next.top &&
        current.width === next.width &&
        current.height === next.height
      ) {
        return prev;
      }
      return { ...prev, [paneId]: next };
    });
  }, []);

  const handleTerminalSlotMount = useCallback(
    (paneId: string, el: HTMLDivElement | null) => {
      const existingObserver = slotObserversRef.current.get(paneId);
      if (existingObserver) {
        existingObserver.disconnect();
        slotObserversRef.current.delete(paneId);
      }

      if (!el) {
        slotElementsRef.current.delete(paneId);
        setPaneRects((prev) => {
          if (!(paneId in prev)) return prev;
          const next = { ...prev };
          delete next[paneId];
          return next;
        });
        return;
      }

      slotElementsRef.current.set(paneId, el);
      const observer = new ResizeObserver(() => updatePaneRect(paneId));
      observer.observe(el);
      slotObserversRef.current.set(paneId, observer);
      updatePaneRect(paneId);
    },
    [updatePaneRect],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(() => {
      slotElementsRef.current.forEach((_, paneId) => updatePaneRect(paneId));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [updatePaneRect]);

  useEffect(() => {
    return () => {
      slotObserversRef.current.forEach((observer) => observer.disconnect());
      slotObserversRef.current.clear();
    };
  }, []);

  const getTerminalOverlayStyle = useCallback(
    (paneId: string, tabId: string): React.CSSProperties => {
      const rect = paneRects[paneId];
      const isActiveTab = tabId === activeTabId;
      if (!rect || !isActiveTab || rect.width < 2 || rect.height < 2) {
        return {
          position: "absolute",
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          visibility: "hidden",
          pointerEvents: "none",
        };
      }
      return {
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        visibility: "visible",
        pointerEvents: "auto",
      };
    },
    [activeTabId, paneRects],
  );

  const setActiveTabId = useSessionStore((state) => state.setActiveTabId);
  const setActivePaneId = useSessionStore((state) => state.setActivePaneId);
  const updateTabState = useSessionStore((state) => state.updateTabState);
  const clearTabState = useSessionStore((state) => state.clearTabState);
  const resetSidePanels = useSessionStore((state) => state.resetAllTabStates);

  const createNewTab = useSessionStore((state) => state.createNewTab);
  const closeTab = useSessionStore((state) => state.closeTab);
  const splitPane = useSessionStore((state) => state.splitPane);
  const closePane = useSessionStore((state) => state.closePane);
  const triggerReconnect = useSessionStore((state) => state.triggerReconnect);
  const triggerDisconnect = useSessionStore((state) => state.triggerDisconnect);
  const reorderTabs = useSessionStore((state) => state.reorderTabs);
  const movePaneToTab = useSessionStore((state) => state.movePaneToTab);
  const mergeTab = useSessionStore((state) => state.mergeTab);

  const [sidePanel, setSidePanel] = useState<SidePanel>("none");
  const [portOverlay, setPortOverlay] = useState(false);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Tmux prefix states
  const [prefixActive, setPrefixActive] = useState(false);
  const prefixTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const mainState = tabStates["main"] || {
    sessionState: hasStoredCredential ? "connecting" : "auth",
    shellWs: null,
    sessionCredentials: null,
  };
  const isMainConnected = mainState.sessionState === "connected";

  const activePaneState = tabStates[activePaneId] || {
    sessionState: hasStoredCredential ? "connecting" : "auth",
    shellWs: null,
    sessionCredentials: null,
  };
  const sessionState = activePaneState.sessionState;
  const shellWs = activePaneState.shellWs || mainState.shellWs;
  const sessionCredentials = activePaneState.sessionCredentials || mainState.sessionCredentials;

  const isConnected = sessionState === "connected";

  const togglePortForward = () => {
    if (!isMainConnected) return;
    setSidePanel((p) => (p === "ports" ? "none" : "ports"));
    setPortOverlay(false);
  };

  const toggleSftp = () => {
    if (!isMainConnected) return;
    let foundTabId: string | null = null;
    let foundPaneId: string | null = null;
    
    for (const tab of tabs) {
      const paneId = findPaneIdByType(tab.layout, "files");
      if (paneId) {
        foundTabId = tab.id;
        foundPaneId = paneId;
        break;
      }
    }
    
    if (foundTabId && foundPaneId) {
      setActiveTabId(foundTabId);
      setActivePaneId(foundPaneId);
    } else {
      createNewTab(undefined, "Files", "files");
    }
  };

  const toggleDocker = () => {
    if (!isMainConnected) return;
    let foundTabId: string | null = null;
    let foundPaneId: string | null = null;
    
    for (const tab of tabs) {
      const paneId = findPaneIdByType(tab.layout, "docker");
      if (paneId) {
        foundTabId = tab.id;
        foundPaneId = paneId;
        break;
      }
    }
    
    if (foundTabId && foundPaneId) {
      setActiveTabId(foundTabId);
      setActivePaneId(foundPaneId);
    } else {
      createNewTab(undefined, "Docker", "docker");
    }
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleDisconnect = () => {
    triggerDisconnect((termId) => {
      terminalRefs.current.get(termId)?.disconnect();
      terminalRefs.current.delete(termId);
    });
    setSidePanel("none");
    setPortOverlay(false);
  };

  const disconnectOnLeave = useCallback(() => {
    for (const term of terminalRefs.current.values()) {
      term.closeSocket();
    }
    terminalRefs.current.clear();
    if (quickSessionId) {
      void fetch(`/api/history/end-quick/${quickSessionId}`, {
        method: "POST",
        keepalive: true,
      });
    } else if (connectionId) {
      void fetch(`/api/history/end-connection/${connectionId}`, {
        method: "POST",
        keepalive: true,
      });
    }
  }, [connectionId, quickSessionId]);

  useDisconnectOnLeave(disconnectOnLeave);

  const handleReconnect = () => {
    setSidePanel("none");
    setPortOverlay(false);
    triggerReconnect();
  };

  const handleCreateNewTab = () => {
    createNewTab();
  };

  const handleSplit = (
    targetId: string,
    direction: "horizontal" | "vertical",
    execCommand?: string,
    title?: string,
    componentType: "terminal" | "docker" | "files" = "terminal"
  ) => {
    splitPane(targetId, direction, execCommand, title, componentType);
  };

  const handleSplitActivePane = (direction: "horizontal" | "vertical") => {
    handleSplit(activePaneId, direction);
  };

  const handleClosePane = (targetId: string) => {
    closePane(targetId, (termId) => {
      terminalRefs.current.get(termId)?.disconnect();
      terminalRefs.current.delete(termId);
    });
  };

  const handleCloseActivePane = () => {
    handleClosePane(activePaneId);
  };

  const handleCloseTab = (tabId: string) => {
    closeTab(tabId, (termId) => {
      terminalRefs.current.get(termId)?.disconnect();
      terminalRefs.current.delete(termId);
    });
  };

  const handleCyclePane = () => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return;
    const termIds = collectAllIds(activeTab.layout);
    if (termIds.length <= 1) return;
    const idx = termIds.indexOf(activePaneId);
    const nextIdx = (idx + 1) % termIds.length;
    setActivePaneId(termIds[nextIdx]);
  };

  const handleMoveFocus = (direction: "left" | "right" | "up" | "down") => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return;
    const termIds = collectAllIds(activeTab.layout);
    if (termIds.length <= 1) return;

    const boxes = termIds
      .map((id) => {
        const el = document.getElementById(`pane-${id}`);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { id, rect };
      })
      .filter(Boolean) as { id: string; rect: DOMRect }[];

    const activeBox = boxes.find((b) => b.id === activePaneId);
    if (!activeBox) return;

    const ax = activeBox.rect.left + activeBox.rect.width / 2;
    const ay = activeBox.rect.top + activeBox.rect.height / 2;

    let bestCandidate: string | null = null;
    let minDistance = Infinity;

    for (const box of boxes) {
      if (box.id === activePaneId) continue;
      const bx = box.rect.left + box.rect.width / 2;
      const by = box.rect.top + box.rect.height / 2;

      const dx = bx - ax;
      const dy = by - ay;

      let isValid = false;
      if (direction === "left" && dx < -10 && Math.abs(dy) < Math.abs(dx)) isValid = true;
      if (direction === "right" && dx > 10 && Math.abs(dy) < Math.abs(dx)) isValid = true;
      if (direction === "up" && dy < -10 && Math.abs(dx) < Math.abs(dy)) isValid = true;
      if (direction === "down" && dy > 10 && Math.abs(dx) < Math.abs(dy)) isValid = true;

      if (isValid) {
        const dist = dx * dx + dy * dy;
        if (dist < minDistance) {
          minDistance = dist;
          bestCandidate = box.id;
        }
      }
    }

    if (bestCandidate) {
      setActivePaneId(bestCandidate);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isMainConnected) return;

      if (e.ctrlKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setPrefixActive(true);
        if (prefixTimeoutRef.current) clearTimeout(prefixTimeoutRef.current);
        prefixTimeoutRef.current = setTimeout(() => {
          setPrefixActive(false);
        }, 3000);
        return;
      }

      if (prefixActive) {
        let handled = false;
        if (e.key === '"') {
          e.preventDefault();
          handleSplitActivePane("vertical");
          handled = true;
        } else if (e.key === "%") {
          e.preventDefault();
          handleSplitActivePane("horizontal");
          handled = true;
        } else if (e.key.toLowerCase() === "x") {
          e.preventDefault();
          handleCloseActivePane();
          handled = true;
        } else if (e.key.toLowerCase() === "c") {
          e.preventDefault();
          handleCreateNewTab();
          handled = true;
        } else if (e.key.toLowerCase() === "o") {
          e.preventDefault();
          handleCyclePane();
          handled = true;
        } else if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          handleMoveFocus(
            e.key.replace("Arrow", "").toLowerCase() as "left" | "right" | "up" | "down"
          );
          handled = true;
        }

        if (handled) {
          setPrefixActive(false);
          if (prefixTimeoutRef.current) clearTimeout(prefixTimeoutRef.current);
        }
        return;
      }

      if (e.altKey && e.shiftKey) {
        if (e.key.toLowerCase() === "v") {
          e.preventDefault();
          handleSplitActivePane("vertical");
        } else if (e.key.toLowerCase() === "h") {
          e.preventDefault();
          handleSplitActivePane("horizontal");
        } else if (e.key.toLowerCase() === "w") {
          e.preventDefault();
          handleCloseActivePane();
        } else if (e.key.toLowerCase() === "n") {
          e.preventDefault();
          handleCreateNewTab();
        }
      } else if (e.altKey && e.key.startsWith("Arrow")) {
        e.preventDefault();
        handleMoveFocus(
          e.key.replace("Arrow", "").toLowerCase() as "left" | "right" | "up" | "down"
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (prefixTimeoutRef.current) clearTimeout(prefixTimeoutRef.current);
    };
  }, [isMainConnected, prefixActive, tabs, activeTabId, activePaneId]);

  usePreventBackspaceNavigation(isMainConnected);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-background text-muted text-sm">
        Loading session...
      </div>
    );
  }

  const canPortForward = Boolean(connectionId) && !isMobile;

  const secondary =
    sidePanel === "ports" && canPortForward ? (
      <div className="h-full overflow-auto bg-zinc-950 p-2">
        <PortForwardPanel
          mode="multiplexed"
          shellWebSocket={shellWs}
          connectionId={connectionId!}
          connectionName={connectionName}
          defaultUsername={defaultUsername}
          hasStoredCredential={hasStoredCredential}
          remoteHostname={hostname}
          onClose={() => setSidePanel("none")}
        />
      </div>
    ) : null;

  const activeTerminal = terminalRefs.current.get(activePaneId);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isTouchDevice || !isMainConnected) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "button, a, input, textarea, select, [role='button'], [contenteditable='true']",
        )
      ) {
        return;
      }
      terminalRefs.current.get(activePaneId)?.focus();
    };

    viewport.addEventListener("pointerdown", onPointerDown);
    return () => viewport.removeEventListener("pointerdown", onPointerDown);
  }, [activePaneId, isMainConnected, isTouchDevice]);

  const getActivePaneComponentType = (node: LayoutNode, targetId: string): string | null => {
    if (node.type === "leaf") {
      return node.id === targetId ? node.componentType : null;
    }
    for (const child of node.children) {
      const type = getActivePaneComponentType(child, targetId);
      if (type) return type;
    }
    return null;
  };
  const activeTabObj = tabs.find((t) => t.id === activeTabId);
  const activeComponentType = activeTabObj ? getActivePaneComponentType(activeTabObj.layout, activePaneId) : null;
  const sftpOpen = activeComponentType === "files";
  const dockerOpen = activeComponentType === "docker";

  const paneSession: PaneSessionProps = {
    connectionId,
    quickSessionId,
    connectionName,
    hostname,
    defaultUsername,
    hasStoredCredential,
    terminalRefs,
    sessionCredentials,
    updateTabState,
    clearTabState,
    resetSidePanels,
    onTerminalSlotMount: handleTerminalSlotMount,
    onDockerAttach: (paneId, containerId, containerName) => {
      const execCommand = `docker exec -it ${containerId} bash || sudo docker exec -it ${containerId} bash || docker exec -it ${containerId} sh || sudo docker exec -it ${containerId} sh`;
      handleSplit(paneId, "horizontal", execCommand, `Exec: ${containerName}`);
    },
  };

  const sessionEndpoint = `${defaultUsername ? `${defaultUsername}@` : ""}${hostname}`;
  const sessionStatus =
    mainState.sessionState === "connected" ? "connected"
    : mainState.sessionState === "connecting" ? "connecting"
    : "disconnected";

  const sessionToolbar =
    isMainConnected ?
      <SshToolbar
        isFullscreen={isFullscreen}
        clipboardOpen={clipboardOpen}
        portForwardOpen={sidePanel === "ports" || portOverlay}
        sftpOpen={sftpOpen}
        dockerOpen={dockerOpen}
        showPortForward={canPortForward}
        onToggleFullscreen={toggleFullscreen}
        onToggleClipboard={() => setClipboardOpen((v) => !v)}
        onTogglePortForward={togglePortForward}
        onToggleSftp={toggleSftp}
        onToggleDocker={toggleDocker}
        onReconnect={handleReconnect}
        onDisconnect={handleDisconnect}
        onFocusTerminal={() => activeTerminal?.focus()}
      />
    : undefined;

  const sessionTabs =
    isMainConnected ?
      <>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                draggable={!isTouchDevice}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/tab-id", tab.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedTabId = e.dataTransfer.getData("text/tab-id");
                  const draggedPaneId = e.dataTransfer.getData("text/pane-id");
                  const sourceTabId = e.dataTransfer.getData("text/source-tab-id");

                  if (draggedTabId && draggedTabId !== tab.id) {
                    reorderTabs(draggedTabId, tab.id);
                  } else if (draggedPaneId && sourceTabId && sourceTabId !== tab.id) {
                    movePaneToTab(draggedPaneId, sourceTabId, tab.id);
                  }
                }}
                className={cn(
                  "flex shrink-0 cursor-grab items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors active:cursor-grabbing",
                  isActive ?
                    "border-primary/30 bg-primary/10 font-medium text-foreground"
                  : "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Terminal className="h-3 w-3 shrink-0" />
                <span className="max-w-[8rem] truncate">{tab.title}</span>
                {tab.id !== "main" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseTab(tab.id);
                    }}
                    className="rounded p-0.5 text-muted hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleCreateNewTab}
            title="New tab (Alt+Shift+N)"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {prefixActive ?
            <Badge variant="success" className="animate-pulse font-mono text-[10px]">
              Prefix active
            </Badge>
          : <span className="hidden font-mono text-[10px] text-muted sm:inline">Ctrl+B</span>}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
            onClick={() => setShowShortcutsHelp((v) => !v)}
          >
            <Keyboard className="h-3 w-3" />
            Shortcuts
          </Button>
        </div>
      </>
    : undefined;

  const sessionBody = (
    <div ref={containerRef} className="relative flex h-full min-h-0 flex-1 flex-col bg-background">
      {clipboardOpen && isMainConnected && (
        <SshPastePanel
          pasteText={pasteText}
          onPasteTextChange={setPasteText}
          onSendPaste={() => {
            activeTerminal?.write(pasteText);
            setPasteText("");
            setClipboardOpen(false);
          }}
          onClose={() => setClipboardOpen(false)}
        />
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <SplitPane
          primary={
            <div className="relative flex h-full min-h-0 flex-1 flex-col">
              {showShortcutsHelp && (
                <div className="absolute right-3 top-3 z-50 w-72 space-y-2 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground shadow-xl">
                  <div className="mb-1.5 flex items-center justify-between border-b border-border pb-1.5">
                    <span className="font-semibold text-foreground">Keyboard shortcuts</span>
                    <button
                      type="button"
                      onClick={() => setShowShortcutsHelp(false)}
                      className="text-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1 font-mono text-[11px]">
                    <div className="mb-1 font-semibold text-primary">Prefix: Ctrl+B</div>
                    <div className="flex justify-between">
                      <span>Ctrl+B then %</span>{" "}
                      <span className="text-zinc-400">Split Horizontally</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ctrl+B then "</span>{" "}
                      <span className="text-zinc-400">Split Vertically</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ctrl+B then x</span> <span className="text-zinc-400">Close Pane</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ctrl+B then c</span>{" "}
                      <span className="text-zinc-400">Create Tab</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ctrl+B then o</span>{" "}
                      <span className="text-zinc-400">Cycle Panes</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ctrl+B then Arrows</span>{" "}
                      <span className="text-zinc-400">Navigate Focus</span>
                    </div>
                    <hr className="border-zinc-800 my-1" />
                    <div className="text-emerald-400 font-semibold mb-1">
                      Prefix-free combinations:
                    </div>
                    <div className="flex justify-between">
                      <span>Alt+Shift+H</span>{" "}
                      <span className="text-zinc-400">Split Horizontally</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Alt+Shift+V</span>{" "}
                      <span className="text-zinc-400">Split Vertically</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Alt+Shift+W</span> <span className="text-zinc-400">Close Pane</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Alt+Shift+N</span> <span className="text-zinc-400">Create Tab</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Alt+Arrows</span> <span className="text-zinc-400">Navigate Focus</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Recursive Pane Tree Views for all tabs simultaneously */}
              <div ref={viewportRef} className="relative flex min-h-0 w-full flex-1 flex-col p-1">
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTabId;
                  return (
                    <div key={tab.id} className={`flex-1 h-full w-full flex flex-col min-h-0 ${isActive ? "" : "hidden"}`}>
                      <PaneLayout
                        node={tab.layout}
                        activePaneId={activePaneId}
                        setActivePaneId={setActivePaneId}
                        onSplit={handleSplit}
                        onClosePane={handleClosePane}
                        activeTabId={activeTabId}
                        mergeTab={mergeTab}
                        session={paneSession}
                      />
                    </div>
                  );
                })}

                {/* Stable terminal pool — survives split/merge layout restructures */}
                <div className="absolute inset-0 pointer-events-none">
                  {terminalPanes.map((pane) => (
                    <div
                      key={`${pane.id}-${reconnectKey}`}
                      style={getTerminalOverlayStyle(pane.id, pane.tabId)}
                      className="absolute flex min-h-0 min-w-0 flex-col select-text"
                    >
                      <StableTerminalInstance
                        paneId={pane.id}
                        execCommand={pane.execCommand}
                        terminalRefs={terminalRefs}
                        connectionId={connectionId}
                        quickSessionId={quickSessionId}
                        connectionName={connectionName}
                        hostname={hostname}
                        defaultUsername={defaultUsername}
                        hasStoredCredential={hasStoredCredential}
                        autoFocusOnConnect={isTouchDevice}
                        updateTabState={updateTabState}
                        clearTabState={clearTabState}
                        resetSidePanels={resetSidePanels}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          }
          secondary={secondary}
          showSecondary={isMainConnected && sidePanel !== "none"}
          minSecondary={320}
          isMobile={isMobile}
          primaryTabLabel="Terminal"
          secondaryTabLabel={
            sidePanel === "sftp" ? "Files" : sidePanel === "ports" ? "Ports" : "Docker"
          }
        />

        {portOverlay && isMainConnected && canPortForward && (
          <div className="absolute inset-x-4 bottom-4 z-20 max-h-[60%] overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
            <PortForwardPanel
              mode="multiplexed"
              shellWebSocket={shellWs}
              connectionId={connectionId!}
              connectionName={connectionName}
              defaultUsername={defaultUsername}
              hasStoredCredential={hasStoredCredential}
              remoteHostname={hostname}
              onClose={() => setPortOverlay(false)}
            />
          </div>
        )}

      </div>
    </div>
  );

  if (chromeless) {
    return sessionBody;
  }

  return (
    <SessionLayout
      title={connectionName}
      protocol="ssh"
      endpoint={sessionEndpoint}
      status={sessionStatus}
      toolbar={sessionToolbar}
      tabs={sessionTabs}
    >
      {sessionBody}
    </SessionLayout>
  );
}
