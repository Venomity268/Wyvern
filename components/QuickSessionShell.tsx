"use client";

import { useState } from "react";
import { SessionLayout } from "@/components/SessionLayout";
import { SaveQuickConnectionDialog } from "@/components/SaveQuickConnectionDialog";
import { Button } from "@/components/ui/button";
import { BookmarkPlus } from "lucide-react";

interface QuickSessionShellProps {
  title: string;
  subtitle: string;
  quickSessionId: string;
  hostname: string;
  port?: number;
  protocol: string;
  workspaces: { id: string; name: string }[];
  children: React.ReactNode;
}

export function QuickSessionShell({
  title,
  subtitle,
  quickSessionId,
  hostname,
  port,
  protocol,
  workspaces,
  children,
}: QuickSessionShellProps) {
  const [saveOpen, setSaveOpen] = useState(false);

  const protocolVariant =
    protocol === "ssh" || protocol === "vnc" || protocol === "rdp" ? protocol : undefined;

  return (
    <SessionLayout
      title={title}
      protocol={protocolVariant}
      endpoint={port ? `${hostname}:${port}` : hostname}
      actions={
        <Button variant="outline" size="sm" className="h-8" onClick={() => setSaveOpen(true)}>
          <BookmarkPlus className="mr-1 h-4 w-4" />
          Save connection
        </Button>
      }
    >
      <div className="relative flex h-full min-h-0 flex-1 flex-col">
        {children}
        <SaveQuickConnectionDialog
          quickSessionId={quickSessionId}
          defaultName={title}
          hostname={hostname}
          protocol={protocol}
          workspaces={workspaces}
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
        />
      </div>
    </SessionLayout>
  );
}
