"use client";

import { useEffect, useState } from "react";
import { Search, Monitor, Terminal, Loader2, Server } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function SessionSidebar({ className }: { className?: string }) {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/connections")
      .then((res) => res.json())
      .then((data) => {
        setConnections(data.connections || []);
      })
      .catch((err) => console.error("Failed to load connections", err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = connections.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.hostname.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={cn("flex flex-col border-r border-border bg-card/30", className)}>
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Filter hosts..."
            className="pl-9 bg-background/50 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
        {loading ? (
          <div className="flex justify-center p-4 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No hosts found.
          </div>
        ) : (
          filtered.map((conn) => (
            <div
              key={conn.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/json+connection",
                  JSON.stringify(conn)
                );
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-grab active:cursor-grabbing border border-transparent hover:border-border transition-colors group"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                {conn.protocol === "ssh" || conn.protocol === "telnet" ? (
                  <Terminal className="h-4 w-4" />
                ) : (
                  <Monitor className="h-4 w-4" />
                )}
              </div>
              <div className="flex flex-1 flex-col min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{conn.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                    {conn.protocol}
                  </Badge>
                </div>
                <span className="truncate text-xs text-muted-foreground font-mono">
                  {conn.hostname}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
