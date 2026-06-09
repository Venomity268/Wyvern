import React, { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useSessionStore } from "@/lib/store/sessionStore";
import { Plus, SplitSquareHorizontal, SplitSquareVertical, X, RadioTower, Code2, LogOut, TerminalSquare } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const {
    activePaneId,
    activeTabId,
    tabs,
    isBroadcasting,
    toggleBroadcasting,
    createNewTab,
    splitPane,
    closePane,
    triggerDisconnect
  } = useSessionStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div 
        className="w-full max-w-[600px] overflow-hidden shadow-2xl rounded-xl border border-zinc-800 bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="flex w-full flex-col overflow-hidden bg-transparent text-zinc-100">
          <Command.Input
            autoFocus
            placeholder="Type a command or search..."
            className="flex h-14 w-full rounded-md bg-transparent px-4 py-3 text-sm outline-none placeholder:text-zinc-500 border-b border-zinc-800"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
            <Command.Empty className="py-6 text-center text-sm text-zinc-500">
              No results found.
            </Command.Empty>

            <Command.Group heading="Session & Layout" className="text-xs font-medium text-zinc-500 px-2 py-1">
              <Command.Item
                onSelect={() => runCommand(() => createNewTab(undefined, "Terminal", "terminal"))}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-200 cursor-pointer hover:bg-zinc-800 aria-selected:bg-zinc-800"
              >
                <Plus className="h-4 w-4 text-zinc-400" />
                New Terminal Tab
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => splitPane(activePaneId, "horizontal", undefined, "Terminal", "terminal"))}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-200 cursor-pointer hover:bg-zinc-800 aria-selected:bg-zinc-800"
              >
                <SplitSquareHorizontal className="h-4 w-4 text-zinc-400" />
                Split Horizontally
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => splitPane(activePaneId, "vertical", undefined, "Terminal", "terminal"))}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-200 cursor-pointer hover:bg-zinc-800 aria-selected:bg-zinc-800"
              >
                <SplitSquareVertical className="h-4 w-4 text-zinc-400" />
                Split Vertically
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => closePane(activePaneId, () => {}))}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-200 cursor-pointer hover:bg-zinc-800 aria-selected:bg-zinc-800"
              >
                <X className="h-4 w-4 text-zinc-400" />
                Close Active Pane
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Tools & Input" className="text-xs font-medium text-zinc-500 px-2 py-1">
              <Command.Item
                onSelect={() => runCommand(() => toggleBroadcasting())}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-200 cursor-pointer hover:bg-zinc-800 aria-selected:bg-zinc-800"
              >
                <RadioTower className={`h-4 w-4 ${isBroadcasting ? "text-red-400" : "text-zinc-400"}`} />
                {isBroadcasting ? "Stop Broadcasting Input" : "Broadcast Input to All Panes"}
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Connection" className="text-xs font-medium text-zinc-500 px-2 py-1">
              <Command.Item
                onSelect={() => runCommand(() => triggerDisconnect(() => {}))}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-red-400 cursor-pointer hover:bg-red-950 aria-selected:bg-red-950"
              >
                <LogOut className="h-4 w-4 text-red-400" />
                Disconnect
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
