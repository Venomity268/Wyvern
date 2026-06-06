"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle, type Layout } from "react-resizable-panels";
import { X } from "lucide-react";
import { SessionLayout } from "@/components/SessionLayout";
import { SplitPane } from "@/components/SplitPane";
import {
  SshTerminal,
  type SshTerminalHandle,
  type SshConnectionState,
} from "@/components/SshTerminal";
import { SshToolbar } from "@/components/SshToolbar";
import { PortForwardPanel } from "@/components/PortForwardPanel";
import { FileManagerPanel } from "@/components/file-manager/FileManagerPanel";
import { DockerPanel } from "@/components/DockerPanel";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import {
  useSessionStore,
  type LayoutNode,
  type TerminalTab,
  collectAllIds,
} from "@/lib/store/sessionStore";

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

// Wrapper for direct rendering of SshTerminal inside leaf node Panels
const PaneTerminalWrapper = ({
  paneId,
  execCommand,
  paneVisible,
  terminalRefs,
  connectionId,
  quickSessionId,
  connectionName,
  hostname,
  defaultUsername,
  hasStoredCredential,
  updateTabState,
  clearTabState,
  resetSidePanels,
  reconnectKey,
}: {
  paneId: string;
  execCommand?: string;
  paneVisible: boolean;
  terminalRefs: React.RefObject<Map<string, SshTerminalHandle>>;
  connectionId?: string;
  quickSessionId?: string;
  connectionName: string;
  hostname: string;
  defaultUsername?: string | null;
  hasStoredCredential: boolean;
  updateTabState: (id: string, state: any) => void;
  clearTabState: (id: string) => void;
  resetSidePanels: () => void;
  reconnectKey: number;
}) => {
  return (
    <SshTerminal
      key={`${paneId}-${reconnectKey}`}
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
      paneVisible={paneVisible}
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
};

const PanePlaceholder = ({
  id,
  onRectChange,
}: {
  id: string;
  onRectChange: (id: string, rect: DOMRect | null, el: HTMLDivElement) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      onRectChange(id, rect, el);
    });

    observer.observe(el);
    // Initial measurement
    onRectChange(id, el.getBoundingClientRect(), el);

    return () => {
      observer.disconnect();
      onRectChange(id, null, el);
    };
  }, [id, onRectChange]);

  return <div ref={ref} id={`placeholder-${id}`} className="w-full h-full relative" />;
};

// Recursive layout renderer mapping LayoutNode branch/leaf tree
const PaneLayout = ({
  node,
  activePaneId,
  setActivePaneId,
  onSplit,
  onClosePane,
  onRectChange,
  activeTabId,
  mergeTab,
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
  onRectChange: (id: string, rect: DOMRect | null, el: HTMLDivElement) => void;
  activeTabId: string;
  mergeTab: (sourceTabId: string, targetTabId: string, targetPaneId?: string) => void;
}) => {
  const updateSplitSizes = useSessionStore((state) => state.updateSplitSizes);

  if (node.type === "leaf") {
    const isActive = node.id === activePaneId;

    return (
      <div
        className={`relative w-full h-full flex flex-col min-w-0 min-h-0 rounded border-2 transition-colors duration-150 ${
          isActive
            ? "border-emerald-500 bg-zinc-950"
            : "border-zinc-800 hover:border-zinc-700 bg-zinc-950"
        }`}
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
        {/* Pane Toolbar Header */}
        <div
          className="flex items-center justify-between bg-zinc-900 px-2 py-1 text-[10px] text-zinc-400 select-none shrink-0 border-b border-zinc-800 hover:bg-zinc-850 transition-colors"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-zinc-650 font-bold select-none">⋮⋮</span>
            <span className="truncate font-mono">
              {node.componentType.toUpperCase()} ({node.title})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSplit(node.id, "horizontal");
              }}
              className="hover:text-zinc-200 text-[12px] leading-none"
              title="Split Horizontally (Ctrl+B then %)"
            >
              ◧
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSplit(node.id, "vertical");
              }}
              className="hover:text-zinc-200 text-[12px] leading-none"
              title='Split Vertically (Ctrl+B then ")'
            >
              ◫
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClosePane(node.id);
              }}
              className="hover:text-red-400 text-red-500 font-bold font-mono"
              title="Close Pane (Ctrl+B then x)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Active Component Core */}
        <div className="flex-1 min-h-0 relative">
          <PanePlaceholder id={node.id} onRectChange={onRectChange} />
        </div>
      </div>
    );
  }

  const direction = node.direction;

  return (
    <PanelGroup
      orientation={direction}
      className="h-full w-full"
      onLayoutChanged={(layout: Layout) => {
        const sizes = node.children.map(
          (child) => layout[child.id] ?? (node.sizes?.[node.children.indexOf(child)] ?? 100 / node.children.length)
        );
        updateSplitSizes(node.id, sizes);
      }}
    >
      {node.children.flatMap((child, index) => {
        const defaultSize = node.sizes?.[index] ?? 100 / node.children.length;

        const result = [
          <Panel key={child.id} id={child.id} defaultSize={defaultSize} minSize={10}>
            <PaneLayout
              node={child}
              activePaneId={activePaneId}
              setActivePaneId={setActivePaneId}
              onSplit={onSplit}
              onClosePane={onClosePane}
              onRectChange={onRectChange}
              activeTabId={activeTabId}
              mergeTab={mergeTab}
            />
          </Panel>
        ];

        if (index < node.children.length - 1) {
          result.push(
            <div
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
  const isMobile = useIsMobile();

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
 
  const collectAllPanesFromTree = useCallback((node: LayoutNode): Array<{
    id: string;
    componentType: "terminal" | "docker" | "files";
    title: string;
    execCommand?: string;
  }> => {
    if (node.type === "leaf") {
      return [{
        id: node.id,
        componentType: node.componentType,
        title: node.title,
        execCommand: node.execCommand,
      }];
    }
    return node.children.flatMap(collectAllPanesFromTree);
  }, []);
 
  const allPanes = tabs.flatMap((tab) => collectAllPanesFromTree(tab.layout));
 
  const setActiveTabId = useSessionStore((state) => state.setActiveTabId);

  const [paneRects, setPaneRects] = useState<Record<string, DOMRect>>({});
  const activeElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleRectChange = useCallback((id: string, rect: DOMRect | null, el: HTMLDivElement) => {
    if (!rect) {
      if (activeElementsRef.current.get(id) === el) {
        activeElementsRef.current.delete(id);
        setPaneRects((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
      return;
    }

    activeElementsRef.current.set(id, el);

    setPaneRects((prev) => {
      const existing = prev[id];
      if (
        existing &&
        existing.left === rect.left &&
        existing.top === rect.top &&
        existing.width === rect.width &&
        existing.height === rect.height
      ) {
        return prev;
      }
      return { ...prev, [id]: rect };
    });
  }, []);

  const getTerminalStyle = (termId: string) => {
    const rect = paneRects[termId];
    const parent = viewportRef.current?.getBoundingClientRect();

    if (!rect || !parent) {
      return {
        position: "absolute" as const,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        visibility: "hidden" as const,
        pointerEvents: "none" as const,
        opacity: 0,
      };
    }

    return {
      position: "absolute" as const,
      left: rect.left - parent.left,
      top: rect.top - parent.top,
      width: rect.width,
      height: rect.height,
      visibility: "visible" as const,
      pointerEvents: "auto" as const,
      opacity: 1,
      zIndex: 10,
    };
  };
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
        const el = document.getElementById(`placeholder-${id}`);
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

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-zinc-950 text-zinc-555 text-sm">
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

  const sessionBody = (
    <div ref={containerRef} className="relative flex h-full flex-col bg-zinc-950">
      {isMainConnected && (
        <SshToolbar
          isFullscreen={isFullscreen}
          clipboardOpen={clipboardOpen}
          portForwardOpen={sidePanel === "ports" || portOverlay}
          sftpOpen={sftpOpen}
          dockerOpen={dockerOpen}
          showPortForward={canPortForward}
          pasteText={pasteText}
          onToggleFullscreen={toggleFullscreen}
          onToggleClipboard={() => setClipboardOpen((v) => !v)}
          onTogglePortForward={togglePortForward}
          onToggleSftp={toggleSftp}
          onToggleDocker={toggleDocker}
          onPasteTextChange={setPasteText}
          onSendPaste={() => {
            activeTerminal?.write(pasteText);
            setPasteText("");
          }}
          onReconnect={handleReconnect}
          onDisconnect={handleDisconnect}
          onFocusTerminal={() => activeTerminal?.focus()}
        />
      )}

      <div ref={viewportRef} className="relative min-h-0 flex-1 flex flex-col">
        <SplitPane
          primary={
            <div className="relative h-full min-h-0 flex-1 flex flex-col">
              {/* Tab Bar */}
              {isMainConnected && (
                <div className="flex items-center justify-between bg-zinc-900 border-b border-zinc-850 px-3 py-1.5 overflow-x-auto shrink-0 select-none scrollbar-none gap-2">
                  <div className="flex items-center gap-1.5">
                    {tabs.map((tab) => {
                      const isActive = tab.id === activeTabId;
                      return (
                        <div
                          key={tab.id}
                          onClick={() => {
                            setActiveTabId(tab.id);
                          }}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/tab-id", tab.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                          }}
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
                          className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded border cursor-pointer transition-colors shrink-0 ${
                            isActive
                              ? "bg-zinc-800 text-zinc-100 border-zinc-750 font-medium cursor-grab active:cursor-grabbing"
                              : "bg-zinc-950/40 text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-850/30 cursor-grab active:cursor-grabbing"
                          }`}
                        >
                          <span>📁 {tab.title}</span>
                          {tab.id !== "main" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCloseTab(tab.id);
                              }}
                              className="text-zinc-550 hover:text-zinc-300 rounded p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={handleCreateNewTab}
                      className="flex items-center justify-center p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs border border-zinc-800"
                      title="New Tab (Alt+Shift+N)"
                    >
                      ➕
                    </button>
                  </div>

                  {/* Status Pill and Help */}
                  <div className="flex items-center gap-2 text-xs">
                    {prefixActive ? (
                      <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2.5 py-0.5 rounded-full text-[10px] font-semibold animate-pulse tracking-wide font-mono">
                        ⌨ PREFIX ACTIVE
                      </span>
                    ) : (
                      <span className="text-zinc-550 text-[10px] font-mono select-none">
                        Prefix: Ctrl+B
                      </span>
                    )}
                    <button
                      onClick={() => setShowShortcutsHelp((v) => !v)}
                      className="text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:bg-zinc-800 px-2 py-0.5 rounded text-[10px] font-medium"
                    >
                      ⌨ Shortcuts
                    </button>
                  </div>
                </div>
              )}

              {/* Keyboard shortcuts popup help */}
              {showShortcutsHelp && (
                <div className="absolute top-10 right-3 z-50 w-72 rounded-lg border border-zinc-800 bg-zinc-900 p-3 shadow-xl text-xs space-y-2 text-zinc-300">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-1.5">
                    <span className="font-semibold text-zinc-100">
                      Keyboard Shortcuts (tmux style)
                    </span>
                    <button
                      onClick={() => setShowShortcutsHelp(false)}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="space-y-1 font-mono text-[11px]">
                    <div className="text-emerald-400 font-semibold mb-1">
                      Prefix key: Ctrl+B
                    </div>
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
              <div className="flex-1 min-h-0 w-full flex flex-col p-1.5">
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
                        onRectChange={handleRectChange}
                        activeTabId={activeTabId}
                        mergeTab={mergeTab}
                      />
                    </div>
                  );
                })}
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

        {/* Flat Overlays Layer */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-10">
          {allPanes.map((pane) => {
            const style = getTerminalStyle(pane.id);
            const isActiveTab = tabs.find((t) => t.id === activeTabId)
              ? collectAllIds(tabs.find((t) => t.id === activeTabId)!.layout).includes(pane.id)
              : false;
            const isPaneVisible = isActiveTab && style.visibility === "visible";

            return (
              <div
                key={pane.id}
                style={style}
                className="absolute overflow-hidden"
              >
                {pane.componentType === "terminal" && (
                  <PaneTerminalWrapper
                    paneId={pane.id}
                    execCommand={pane.execCommand}
                    paneVisible={isPaneVisible}
                    terminalRefs={terminalRefs}
                    connectionId={connectionId}
                    quickSessionId={quickSessionId}
                    connectionName={connectionName}
                    hostname={hostname}
                    defaultUsername={defaultUsername}
                    hasStoredCredential={hasStoredCredential}
                    updateTabState={updateTabState}
                    clearTabState={clearTabState}
                    resetSidePanels={resetSidePanels}
                    reconnectKey={reconnectKey}
                  />
                )}
                {pane.componentType === "files" && (
                  <FileManagerPanel
                    key={`files-${connectionId || quickSessionId}-${reconnectKey}-${pane.id}`}
                    connectionId={connectionId}
                    quickSessionId={quickSessionId}
                    defaultUsername={defaultUsername}
                    hasStoredCredential={hasStoredCredential}
                    sessionAuth={sessionCredentials}
                    onClose={() => handleClosePane(pane.id)}
                  />
                )}
                {pane.componentType === "docker" && (
                  connectionId ? (
                    <DockerPanel
                      connectionId={connectionId}
                      onAttachTerminal={(containerId, containerName) => {
                        const execCommand = `docker exec -it ${containerId} bash || sudo docker exec -it ${containerId} bash || docker exec -it ${containerId} sh || sudo docker exec -it ${containerId} sh`;
                        handleSplit(pane.id, "horizontal", execCommand, `Exec: ${containerName}`);
                      }}
                      onClose={() => handleClosePane(pane.id)}
                    />
                  ) : (
                    <div className="p-4 text-zinc-400 text-xs font-mono">Docker requires a saved connection.</div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (chromeless) {
    return sessionBody;
  }

  return (
    <SessionLayout title={connectionName} subtitle={`SSH → ${hostname}`}>
      {sessionBody}
    </SessionLayout>
  );
}
