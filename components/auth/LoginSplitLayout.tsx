"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";

const BRAND_WIDTH_KEY = "login-brand-width-px";

/** Original fixed brand width: `min(32vw, 360px)`. */
export function getDefaultBrandWidth(viewportWidth: number): number {
  return Math.min(Math.round(viewportWidth * 0.32), 360);
}

interface LoginBrandPanelProps {
  className?: string;
}

export function LoginBrandPanel({ className }: LoginBrandPanelProps) {
  return (
    <aside
      className={cn(
        "login-brand-panel flex h-full min-h-screen flex-col border-r border-border",
        className,
      )}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <h1 className="font-mono text-3xl font-bold uppercase tracking-[0.35em] text-foreground xl:text-4xl">
          {APP_NAME}
        </h1>
        <div className="mt-4 h-0.5 w-12 bg-primary" />
        <p className="mt-6 max-w-[16rem] font-mono text-[10px] uppercase leading-relaxed tracking-widest text-muted-foreground">
          {APP_TAGLINE}
        </p>
      </div>
    </aside>
  );
}

interface LoginSplitLayoutProps {
  brand: React.ReactNode;
  form: React.ReactNode;
}

export function LoginSplitLayout({ brand, form }: LoginSplitLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const brandWidthRef = useRef(360);
  const minWidthRef = useRef(360);
  const [brandWidth, setBrandWidth] = useState(360);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const defaultW = getDefaultBrandWidth(window.innerWidth);
    minWidthRef.current = defaultW;

    let width = defaultW;
    try {
      localStorage.removeItem("login-panel-layout");
      const stored = localStorage.getItem(BRAND_WIDTH_KEY);
      if (stored) {
        const px = Number.parseInt(stored, 10);
        if (Number.isFinite(px)) {
          width = Math.max(defaultW, px);
        }
      }
    } catch {
      // ignore
    }

    brandWidthRef.current = width;
    setBrandWidth(width);
    setReady(true);
  }, []);

  const clampWidth = useCallback((px: number) => {
    const containerW = containerRef.current?.clientWidth ?? window.innerWidth;
    const minW = minWidthRef.current;
    const maxW = Math.max(minW, Math.round(containerW * 0.5));
    return Math.min(maxW, Math.max(minW, px));
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = clampWidth(e.clientX - rect.left);
      brandWidthRef.current = next;
      setBrandWidth(next);
    },
    [clampWidth],
  );

  const onPointerEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      localStorage.setItem(BRAND_WIDTH_KEY, String(Math.round(brandWidthRef.current)));
    } catch {
      // ignore
    }
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-[min(32vw,360px)] shrink-0 lg:block">{brand}</div>
        <div className="min-w-0 flex-1">{form}</div>
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="hidden min-h-screen w-full lg:flex">
        <div className="h-full shrink-0" style={{ width: brandWidth }}>
          {brand}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize brand panel"
          className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40 active:bg-primary/60"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        />
        <div className="min-w-0 flex-1">{form}</div>
      </div>

      <div className="min-h-screen lg:hidden">{form}</div>
    </>
  );
}
