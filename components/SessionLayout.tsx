"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

interface SessionLayoutProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function SessionLayout({ title, subtitle, actions, children }: SessionLayoutProps) {
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
      className="flex flex-col bg-zinc-950 overflow-hidden"
      style={{ height: viewportHeight }}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-2 py-1.5 sm:px-4 sm:py-2">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-zinc-300 px-2 sm:px-3">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-xs sm:text-sm font-medium text-zinc-100">{title}</h1>
            {subtitle && <p className="hidden sm:block text-xs text-zinc-500">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
