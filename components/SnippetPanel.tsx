import React, { useState } from "react";
import { useSnippetStore, Snippet } from "@/lib/store/snippetStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { SshTerminalHandle } from "./SshTerminal";

interface SnippetPanelProps {
  terminalRefs: React.RefObject<Map<string, SshTerminalHandle>>;
  activePaneId: string;
}

export function SnippetPanel({ terminalRefs, activePaneId }: SnippetPanelProps) {
  const { snippets, addSnippet, deleteSnippet } = useSnippetStore();
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");

  const handleAdd = () => {
    if (!newName.trim() || !newCommand.trim()) return;
    addSnippet(newName.trim(), newCommand.trim());
    setNewName("");
    setNewCommand("");
  };

  const handleRun = (snippet: Snippet, all: boolean) => {
    const command = snippet.command + "\n";
    if (all) {
      terminalRefs.current?.forEach((handle) => {
        handle.write(command);
      });
    } else {
      const activeTerm = terminalRefs.current?.get(activePaneId);
      if (activeTerm) {
        activeTerm.write(command);
      }
    }
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between border-b border-zinc-800 p-3">
        <h3 className="font-medium text-sm">Command Snippets</h3>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {snippets.length === 0 ? (
          <div className="text-sm text-zinc-500 italic text-center mt-4">
            No snippets saved.
          </div>
        ) : (
          snippets.map((snippet) => (
            <div
              key={snippet.id}
              className="group flex flex-col gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 p-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{snippet.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-zinc-400 hover:text-red-400"
                  onClick={() => deleteSnippet(snippet.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-xs text-zinc-400 font-mono truncate bg-zinc-950 p-1 rounded">
                {snippet.command}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs flex-1"
                  onClick={() => handleRun(snippet, false)}
                >
                  <Play className="h-3 w-3 mr-1" /> Active
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs flex-1"
                  onClick={() => handleRun(snippet, true)}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" /> All
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-zinc-800 p-3 flex flex-col gap-2">
        <Input
          placeholder="Snippet Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-8 text-sm bg-zinc-900 border-zinc-800"
        />
        <div className="flex gap-2">
          <Input
            placeholder="Command to run..."
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            className="h-8 text-sm flex-1 bg-zinc-900 border-zinc-800"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <Button
            size="icon"
            className="h-8 w-8"
            onClick={handleAdd}
            disabled={!newName.trim() || !newCommand.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
