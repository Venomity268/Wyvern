"use client";

import { useRouter } from "next/navigation";
import { ConnectionList, type ConnectionItem } from "@/components/ConnectionList";

interface PinnedConnectionsProps {
  connections: ConnectionItem[];
}

export function PinnedConnections({ connections: initial }: PinnedConnectionsProps) {
  const router = useRouter();

  async function togglePin(connectionId: string) {
    await fetch("/api/pins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    router.refresh();
  }

  if (initial.length === 0) return null;

  const pinnedIds = new Set(initial.map((c) => c.id));

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-foreground">Pinned connections</h2>
      <ConnectionList
        connections={initial}
        layout="grid"
        pinnedIds={pinnedIds}
        onTogglePin={togglePin}
      />
    </section>
  );
}
