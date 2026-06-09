"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type SshConnectionState } from "@/components/SshTerminal";

export interface SessionCredentials {
  username: string;
  password?: string;
  privateKey?: string;
}

export interface TerminalInstance {
  id: string;
  title: string;
  execCommand?: string;
}

export type LayoutNode =
  | {
      id: string;
      type: "leaf";
      componentType: "terminal" | "docker" | "files";
      title: string;
      execCommand?: string;
    }
  | {
      id: string;
      type: "branch";
      direction: "horizontal" | "vertical";
      children: LayoutNode[];
      sizes?: number[];
    };

export interface TerminalTab {
  id: string;
  title: string;
  layout: LayoutNode;
}

export interface TabState {
  sessionState: SshConnectionState;
  shellWs: WebSocket | null;
  sessionCredentials: SessionCredentials | null;
  isRecording?: boolean;
}

// Tree Helpers
function splitNode(
  currentLayout: LayoutNode,
  targetId: string,
  direction: "horizontal" | "vertical",
  newPaneId: string,
  newTitle: string,
  execCommand?: string
): LayoutNode {
  if (currentLayout.id === targetId && currentLayout.type === "leaf") {
    return {
      id: `branch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: "branch",
      direction,
      children: [
        { ...currentLayout },
        {
          id: newPaneId,
          type: "leaf",
          componentType: "terminal",
          title: newTitle,
          execCommand,
        },
      ],
      sizes: [50, 50],
    };
  }

  if (currentLayout.type === "branch") {
    return {
      ...currentLayout,
      children: currentLayout.children.map((child) =>
        splitNode(child, targetId, direction, newPaneId, newTitle, execCommand)
      ),
    };
  }

  return currentLayout;
}

function closeNode(currentLayout: LayoutNode, targetId: string): LayoutNode | null {
  if (currentLayout.type === "leaf") {
    return currentLayout.id === targetId ? null : currentLayout;
  }

  const nextChildren = currentLayout.children
    .map((child) => closeNode(child, targetId))
    .filter(Boolean) as LayoutNode[];

  if (nextChildren.length === 0) return null;
  if (nextChildren.length === 1) return nextChildren[0];

  let sizes = currentLayout.sizes;
  if (sizes && sizes.length !== nextChildren.length) {
    const uniform = 100 / nextChildren.length;
    sizes = nextChildren.map(() => uniform);
  }

  return {
    ...currentLayout,
    children: nextChildren,
    sizes,
  };
}

export function collectIds(node: LayoutNode): string[] {
  if (node.type === "leaf") {
    return node.componentType === "terminal" ? [node.id] : [];
  }
  return node.children.flatMap(collectIds);
}

export function collectAllIds(node: LayoutNode): string[] {
  if (node.type === "leaf") {
    return [node.id];
  }
  return node.children.flatMap(collectAllIds);
}

export interface TerminalPaneInfo {
  id: string;
  title: string;
  execCommand?: string;
}

export function collectTerminalLeaves(node: LayoutNode): TerminalPaneInfo[] {
  if (node.type === "leaf") {
    if (node.componentType !== "terminal") return [];
    return [{ id: node.id, title: node.title, execCommand: node.execCommand }];
  }
  return node.children.flatMap(collectTerminalLeaves);
}

function splitSizesEqual(a: number[] | undefined, b: number[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((value, index) => Math.abs(value - b[index]) < 0.01);
}

function updateSplitSizesInTree(node: LayoutNode, branchId: string, sizes: number[]): LayoutNode {
  if (node.type === "leaf") return node;
  if (node.id === branchId) {
    if (splitSizesEqual(node.sizes, sizes)) return node;
    return { ...node, sizes };
  }
  let changed = false;
  const children = node.children.map((child) => {
    const next = updateSplitSizesInTree(child, branchId, sizes);
    if (next !== child) changed = true;
    return next;
  });
  if (!changed) return node;
  return { ...node, children };
}

function findNodeInTree(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  if (root.type === "branch") {
    for (const child of root.children) {
      const found = findNodeInTree(child, id);
      if (found) return found;
    }
  }
  return null;
}

function swapNodesInTree(root: LayoutNode, idA: string, idB: string): LayoutNode {
  const helper = (node: LayoutNode): LayoutNode => {
    if (node.id === idA) {
      return findNodeInTree(root, idB) || node;
    }
    if (node.id === idB) {
      return findNodeInTree(root, idA) || node;
    }
    if (node.type === "branch") {
      return {
        ...node,
        children: node.children.map(helper),
      };
    }
    return node;
  };
  return helper(root);
}

function insertNodeAtLeaf(
  currentLayout: LayoutNode,
  targetId: string,
  direction: "horizontal" | "vertical",
  insertedNode: LayoutNode
): LayoutNode {
  if (currentLayout.id === targetId && currentLayout.type === "leaf") {
    return {
      id: `branch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: "branch",
      direction,
      children: [
        { ...currentLayout },
        insertedNode,
      ],
      sizes: [50, 50],
    };
  }

  if (currentLayout.type === "branch") {
    return {
      ...currentLayout,
      children: currentLayout.children.map((child) =>
        insertNodeAtLeaf(child, targetId, direction, insertedNode)
      ),
    };
  }

  return currentLayout;
}

interface SessionState {
  tabs: TerminalTab[];
  activeTabId: string;
  activePaneId: string;
  allTerminals: TerminalInstance[];
  tabStates: Record<string, TabState>;
  reconnectKey: number;
  hasStoredCredential: boolean;
  isBroadcasting: boolean;

  // Actions
  initialize: (hasStoredCred: boolean) => void;
  toggleBroadcasting: () => void;
  toggleRecording: (paneId: string) => void;
  setActiveTabId: (tabId: string) => void;
  setActivePaneId: (paneId: string) => void;
  updateTabState: (paneId: string, updates: Partial<TabState>) => void;
  clearTabState: (paneId: string) => void;
  resetAllTabStates: () => void;

  createNewTab: (
    execCommand?: string,
    title?: string,
    componentType?: "terminal" | "docker" | "files"
  ) => void;
  closeTab: (tabId: string, disconnectCb: (termId: string) => void) => void;
  splitPane: (
    targetId: string,
    direction: "horizontal" | "vertical",
    execCommand?: string,
    title?: string,
    componentType?: "terminal" | "docker" | "files"
  ) => void;
  closePane: (paneId: string, disconnectCb: (termId: string) => void) => void;
  updateSplitSizes: (branchId: string, sizes: number[]) => void;
  swapPanes: (idA: string, idB: string) => void;
  reorderTabs: (sourceTabId: string, targetTabId: string) => void;
  movePaneToTab: (paneId: string, sourceTabId: string, targetTabId: string) => void;
  mergeTab: (sourceTabId: string, targetTabId: string) => void;
  syncLayout: (tabs: TerminalTab[], activeTabId: string, activePaneId: string) => void;

  triggerReconnect: () => void;
  triggerDisconnect: (disconnectCb: (termId: string) => void) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      tabs: [
        {
          id: "main",
          title: "Terminal",
          layout: { id: "main", type: "leaf", componentType: "terminal", title: "Terminal" },
        },
      ],
      activeTabId: "main",
      activePaneId: "main",
      allTerminals: [{ id: "main", title: "Terminal" }],
      tabStates: {},
      reconnectKey: 0,
      hasStoredCredential: false,
      isBroadcasting: false,

      initialize: (hasStoredCred) =>
        set((state) => {
          // If we restored from localStorage and have multiple tabs or a modified main tab, don't clobber it
          if (state.tabs && (state.tabs.length > 1 || state.allTerminals.length > 1)) {
            return { hasStoredCredential: hasStoredCred };
          }
          return {
            hasStoredCredential: hasStoredCred,
            tabs: [
              {
                id: "main",
                title: "Terminal",
                layout: { id: "main", type: "leaf", componentType: "terminal", title: "Terminal" },
              },
            ],
            activeTabId: "main",
            activePaneId: "main",
            allTerminals: [{ id: "main", title: "Terminal" }],
            tabStates: {},
            isBroadcasting: false,
          };
        }),

      toggleBroadcasting: () => set((state) => ({ isBroadcasting: !state.isBroadcasting })),

      toggleRecording: (paneId) => {
        set((state) => {
          const currentState = state.tabStates[paneId] || { sessionState: "auth", shellWs: null, sessionCredentials: null };
          return {
            tabStates: {
              ...state.tabStates,
              [paneId]: {
                ...currentState,
                isRecording: !currentState.isRecording,
              },
            },
          };
        });
      },

      setActiveTabId: (tabId) =>
        set((state) => {
          const tabObj = state.tabs.find((t) => t.id === tabId);
          const nextPaneId = tabObj ? collectAllIds(tabObj.layout)[0] || "main" : "main";
          return { activeTabId: tabId, activePaneId: nextPaneId };
        }),

  setActivePaneId: (paneId) => set({ activePaneId: paneId }),

  updateTabState: (paneId, updates) =>
    set((state) => ({
      tabStates: {
        ...state.tabStates,
        [paneId]: {
          ...(state.tabStates[paneId] || {
            sessionState: state.hasStoredCredential ? "connecting" : "auth",
            shellWs: null,
            sessionCredentials: null,
          }),
          ...updates,
        },
      },
    })),

  clearTabState: (paneId) =>
    set((state) => {
      const next = { ...state.tabStates };
      delete next[paneId];
      return { tabStates: next };
    }),

  resetAllTabStates: () => set({ tabStates: {} }),

  createNewTab: (execCommand, title, componentType = "terminal") =>
    set((state) => {
      const newTabId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newTermId = `term-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newTitle = title || `Terminal ${state.allTerminals.length + 1}`;

      return {
        allTerminals: [...state.allTerminals, { id: newTermId, title: newTitle, execCommand }],
        tabs: [
          ...state.tabs,
          {
            id: newTabId,
            title: newTitle,
            layout: {
              id: newTermId,
              type: "leaf",
              componentType,
              title: newTitle,
              execCommand,
            },
          },
        ],
        activeTabId: newTabId,
        activePaneId: newTermId,
      };
    }),

  closeTab: (tabId, disconnectCb) =>
    set((state) => {
      const tabObj = state.tabs.find((t) => t.id === tabId);
      if (!tabObj) return {};

      const termIds = collectAllIds(tabObj.layout);
      termIds.forEach((id) => disconnectCb(id));

      const nextTabs = state.tabs.filter((t) => t.id !== tabId);
      const nextTabStates = { ...state.tabStates };
      termIds.forEach((id) => delete nextTabStates[id]);

      const nextAllTerminals = state.allTerminals.filter((t) => !termIds.includes(t.id));

      let nextActiveTabId = state.activeTabId;
      let nextActivePaneId = state.activePaneId;

      if (state.activeTabId === tabId) {
        nextActiveTabId = nextTabs[0]?.id || "main";
        const nextTabObj = nextTabs.find((t) => t.id === nextActiveTabId);
        if (nextTabObj) {
          nextActivePaneId = collectAllIds(nextTabObj.layout)[0] || "main";
        } else {
          nextActivePaneId = "main";
        }
      }

      return {
        tabs: nextTabs,
        tabStates: nextTabStates,
        allTerminals: nextAllTerminals,
        activeTabId: nextActiveTabId,
        activePaneId: nextActivePaneId,
      };
    }),

  splitPane: (targetId, direction, execCommand, title, componentType = "terminal") =>
    set((state) => {
      const newTermId = `term-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newTitle = title || `Terminal ${state.allTerminals.length + 1}`;

      const nextTabs = state.tabs.map((tab) => {
        if (tab.id !== state.activeTabId) return tab;
        return {
          ...tab,
          layout: splitNode(
            tab.layout,
            targetId,
            direction,
            newTermId,
            newTitle,
            execCommand
          ),
        };
      });

      return {
        allTerminals: [...state.allTerminals, { id: newTermId, title: newTitle, execCommand }],
        tabs: nextTabs,
        activePaneId: newTermId,
      };
    }),

  closePane: (paneId, disconnectCb) =>
    set((state) => {
      if (state.allTerminals.length === 1) return {};

      disconnectCb(paneId);

      const nextTabStates = { ...state.tabStates };
      delete nextTabStates[paneId];

      const nextAllTerminals = state.allTerminals.filter((t) => t.id !== paneId);

      const nextTabs = state.tabs
        .map((tab) => {
          const updated = closeNode(tab.layout, paneId);
          if (!updated) return null;
          return { ...tab, layout: updated };
        })
        .filter(Boolean) as TerminalTab[];

      let nextActiveTabId = state.activeTabId;
      if (!nextTabs.some((t) => t.id === nextActiveTabId)) {
        nextActiveTabId = nextTabs[0]?.id || "main";
      }

      let nextActivePaneId = state.activePaneId;
      const activeTabObj = nextTabs.find((t) => t.id === nextActiveTabId);
      if (activeTabObj) {
        const ids = collectAllIds(activeTabObj.layout);
        if (!ids.includes(state.activePaneId)) {
          nextActivePaneId = ids[0] || "main";
        }
      } else {
        nextActivePaneId = "main";
      }

      return {
        tabs: nextTabs,
        tabStates: nextTabStates,
        allTerminals: nextAllTerminals,
        activeTabId: nextActiveTabId,
        activePaneId: nextActivePaneId,
      };
    }),

  updateSplitSizes: (branchId, sizes) =>
    set((state) => {
      let tabsChanged = false;
      const nextTabs = state.tabs.map((tab) => {
        const layout = updateSplitSizesInTree(tab.layout, branchId, sizes);
        if (layout === tab.layout) return tab;
        tabsChanged = true;
        return { ...tab, layout };
      });
      return tabsChanged ? { tabs: nextTabs } : state;
    }),

  swapPanes: (idA, idB) =>
    set((state) => {
      const nextTabs = state.tabs.map((tab) => {
        if (tab.id !== state.activeTabId) return tab;
        return {
          ...tab,
          layout: swapNodesInTree(tab.layout, idA, idB),
        };
      });
      return { tabs: nextTabs };
    }),

  reorderTabs: (sourceTabId, targetTabId) =>
    set((state) => {
      const sourceIdx = state.tabs.findIndex((t) => t.id === sourceTabId);
      const targetIdx = state.tabs.findIndex((t) => t.id === targetTabId);
      if (sourceIdx === -1 || targetIdx === -1) return {};

      const nextTabs = [...state.tabs];
      const [movedTab] = nextTabs.splice(sourceIdx, 1);
      nextTabs.splice(targetIdx, 0, movedTab);

      return { tabs: nextTabs };
    }),

  movePaneToTab: (paneId, sourceTabId, targetTabId) =>
    set((state) => {
      if (sourceTabId === targetTabId) return {};

      const sourceTab = state.tabs.find((t) => t.id === sourceTabId);
      const targetTab = state.tabs.find((t) => t.id === targetTabId);
      if (!sourceTab || !targetTab) return {};

      const paneNode = findNodeInTree(sourceTab.layout, paneId);
      if (!paneNode) return {};

      const updatedSourceLayout = closeNode(sourceTab.layout, paneId);
      const targetPaneId = collectAllIds(targetTab.layout)[0] || "main";
      const updatedTargetLayout = insertNodeAtLeaf(
        targetTab.layout,
        targetPaneId,
        "horizontal",
        paneNode
      );

      const nextTabs = state.tabs
        .map((tab) => {
          if (tab.id === sourceTabId) {
            if (!updatedSourceLayout) return null;
            return { ...tab, layout: updatedSourceLayout };
          }
          if (tab.id === targetTabId) {
            return { ...tab, layout: updatedTargetLayout };
          }
          return tab;
        })
        .filter(Boolean) as TerminalTab[];

      let nextActiveTabId = state.activeTabId;
      if (sourceTabId === state.activeTabId && !updatedSourceLayout) {
        nextActiveTabId = targetTabId;
      }

      return {
        tabs: nextTabs,
        activeTabId: nextActiveTabId,
        activePaneId: paneId,
      };
    }),

  mergeTab: (sourceTabId, targetTabId) =>
    set((state) => {
      if (sourceTabId === targetTabId) return {};

      const sourceTab = state.tabs.find((t) => t.id === sourceTabId);
      const targetTab = state.tabs.find((t) => t.id === targetTabId);
      if (!sourceTab || !targetTab) return {};

      const targetPaneId = collectAllIds(targetTab.layout)[0] || "main";
      const updatedTargetLayout = insertNodeAtLeaf(
        targetTab.layout,
        targetPaneId,
        "horizontal",
        sourceTab.layout
      );

      const nextTabs = state.tabs
        .filter((tab) => tab.id !== sourceTabId)
        .map((tab) => {
          if (tab.id === targetTabId) {
            return { ...tab, layout: updatedTargetLayout };
          }
          return tab;
        });

      let nextActiveTabId = state.activeTabId;
      if (state.activeTabId === sourceTabId) {
        nextActiveTabId = targetTabId;
      }

      const nextActivePaneId = collectAllIds(updatedTargetLayout)[0] || "main";

      return {
        tabs: nextTabs,
        activeTabId: nextActiveTabId,
        activePaneId: nextActivePaneId,
      };
    }),

  syncLayout: (tabs, activeTabId, activePaneId) =>
    set(() => ({
      tabs,
      activeTabId,
      activePaneId,
    })),

  triggerReconnect: () =>
    set((state) => ({
      reconnectKey: state.reconnectKey + 1,
      tabs: [
        {
          id: "main",
          title: "Terminal",
          layout: { id: "main", type: "leaf", componentType: "terminal", title: "Terminal" },
        },
      ],
      activeTabId: "main",
      activePaneId: "main",
      allTerminals: [{ id: "main", title: "Terminal" }],
      tabStates: {},
    })),

  triggerDisconnect: (disconnectCb) =>
    set((state) => {
      state.allTerminals.forEach((t) => disconnectCb(t.id));
      return {
        tabs: [
          {
            id: "main",
            title: "Terminal",
            layout: { id: "main", type: "leaf", componentType: "terminal", title: "Terminal" },
          },
        ],
        activeTabId: "main",
        activePaneId: "main",
        allTerminals: [{ id: "main", title: "Terminal" }],
        tabStates: {},
        isBroadcasting: false,
      };
    }),
    }),
    {
      name: "wterm-session-storage",
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        activePaneId: state.activePaneId,
        allTerminals: state.allTerminals,
      }),
    }
  )
);
