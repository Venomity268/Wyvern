"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { cn } from "@/lib/utils";

type SessionProtocol = "ssh" | "telnet" | "vnc" | "rdp";

interface SessionLayoutProps {
  title: string;
  protocol?: SessionProtocol;
  endpoint?: string;
  status?: "connected" | "connecting" | "disconnected";
  toolbar?: React.ReactNode;
  tabs?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

function StatusDot({ status }: { status: SessionLayoutProps["status"] }) {
  if (!status || status === "disconnected") return null;

  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {status === "connected" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          status === "connected" ? "bg-emerald-400" : "bg-amber-400",
        )}
      />
    </span>
  );
}

export function SessionLayout({
  title,
  protocol,
  endpoint,
  status,
  toolbar,
  tabs,
  actions,
  children,
}: SessionLayoutProps) {
  const [viewportHeight, setViewportHeight] = useState<string>("100vh");
  const isMobile = useIsMobile();

  const [prevIsMobile, setPrevIsMobile] = useState(isMobile);
  if (isMobile !== prevIsMobile) {
    setPrevIsMobile(isMobile);
    if (!isMobile) {
      setViewportHeight("100vh");
    }
  }

  useEffect(() => {
    if (!isMobile || typeof window === "undefined" || !window.visualViewport) {
      return;
    }
    const viewport = window.visualViewport;
    const updateHeight = () => {
      setViewportHeight(`${viewport.height}px`);
    };
    const timeout = setTimeout(updateHeight, 0);
    viewport.addEventListener("resize", updateHeight);
    viewport.addEventListener("scroll", updateHeight);
    return () => {
      clearTimeout(timeout);
      viewport.removeEventListener("resize", updateHeight);
      viewport.removeEventListener("scroll", updateHeight);
    };
  }, [isMobile]);

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: viewportHeight }}
    >
      <header className="shrink-0 border-b border-border bg-card/90 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-2 py-1.5 sm:gap-3 sm:px-3">
          <Link href="/">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              title="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <StatusDot status={status} />
            <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
            {protocol && (
              <Badge variant={protocol} className="shrink-0 uppercase">
                {protocol}
              </Badge>
            )}
            {endpoint && (
              <span className="hidden min-w-0 truncate font-mono text-xs text-muted-foreground md:inline">
                {endpoint}
              </span>
            )}
          </div>

          {(toolbar || actions) && (
            <div className="hidden items-center gap-0.5 lg:flex">
              {toolbar}
              {actions}
            </div>
          )}
        </div>

        {(toolbar || actions) && (
          <div className="flex items-center gap-0.5 overflow-x-auto border-t border-border px-2 py-1 scrollbar-none lg:hidden">
            {toolbar}
            {actions}
          </div>
        )}
      </header>

      {tabs && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-card/60 px-2 py-1 scrollbar-none sm:px-3">
          {tabs}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
