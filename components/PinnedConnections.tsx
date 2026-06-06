"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConnectionList, type ConnectionItem } from "@/components/ConnectionList";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Pin, Zap } from "lucide-react";

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

  const pinnedIds = new Set(initial.map((c) => c.id));

  return (
    <section>
      <h2 className="mb-4 text-sm font-medium text-foreground">Pinned connections</h2>
      {initial.length === 0 ? (
        <EmptyState
          icon={<Pin className="h-5 w-5" />}
          title="No pinned connections"
          description="Pin connections from a workspace to access them quickly from home."
          action={
            <Link href="/connect">
              <Button variant="outline" size="sm">
                <Zap className="h-4 w-4" />
                Quick connect
              </Button>
            </Link>
          }
        />
      ) : (
        <ConnectionList
          connections={initial}
          layout="grid"
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
        />
      )}
    </section>
  );
}
