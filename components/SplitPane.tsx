"use client";

import { useCallback, useRef, useState } from "react";

interface SplitPaneProps {
  direction?: "horizontal" | "vertical";
  initialRatio?: number;
  minPrimary?: number;
  minSecondary?: number;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  showSecondary: boolean;
  isMobile?: boolean;
  primaryTabLabel?: string;
  secondaryTabLabel?: string;
}

export function SplitPane({
  direction = "horizontal",
  initialRatio = 0.65,
  minPrimary = 200,
  minSecondary = 200,
  primary,
  secondary,
  showSecondary,
  isMobile = false,
  primaryTabLabel = "Primary",
  secondaryTabLabel = "Secondary",
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(initialRatio);
  const draggingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<"primary" | "secondary">("primary");

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!showSecondary) return;
    e.preventDefault();
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [showSecondary]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current || !containerRef.current || !showSecondary) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (direction === "horizontal") {
        const x = e.clientX - rect.left;
        const next = Math.min(
          Math.max(x / rect.width, minPrimary / rect.width),
          1 - minSecondary / rect.width,
        );
        setRatio(next);
      } else {
        const y = e.clientY - rect.top;
        const next = Math.min(
          Math.max(y / rect.height, minPrimary / rect.height),
          1 - minSecondary / rect.height,
        );
        setRatio(next);
      }
    },
    [direction, minPrimary, minSecondary, showSecondary],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const [prevShowSecondary, setPrevShowSecondary] = useState(showSecondary);

  if (showSecondary !== prevShowSecondary) {
    setPrevShowSecondary(showSecondary);
    if (showSecondary) {
      setActiveTab("secondary");
    } else {
      setActiveTab("primary");
      setRatio(initialRatio);
    }
  }

  const isHorizontal = direction === "horizontal";

  if (isMobile && showSecondary) {
    return (
      <div className="flex h-full flex-col min-h-0 w-full animate-fadeIn">
        <div className="flex border-b border-zinc-800 bg-zinc-900/90 px-2 shrink-0">
          <button
            type="button"
            className={`px-3 py-2 text-[11px] sm:px-4 sm:py-2.5 sm:text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === "primary"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => setActiveTab("primary")}
          >
            {primaryTabLabel}
          </button>
          <button
            type="button"
            className={`px-3 py-2 text-[11px] sm:px-4 sm:py-2.5 sm:text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === "secondary"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => setActiveTab("secondary")}
          >
            {secondaryTabLabel}
          </button>
        </div>
        <div className="flex-1 min-h-0 relative">
          <div className={`h-full w-full ${activeTab === "primary" ? "" : "hidden"}`}>
            {primary}
          </div>
          <div className={`h-full w-full ${activeTab === "secondary" ? "" : "hidden"}`}>
            {secondary}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex h-full min-h-0 flex-1 ${isHorizontal ? "flex-row" : "flex-col"}`}
    >
      <div
        className="h-full min-h-0 min-w-0 overflow-hidden"
        style={
          isHorizontal
            ? { width: showSecondary ? `${ratio * 100}%` : "100%" }
            : { height: showSecondary ? `${ratio * 100}%` : "100%" }
        }
      >
        {primary}
      </div>
      <div
        role="separator"
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
        aria-hidden={!showSecondary}
        className={`shrink-0 bg-zinc-800 hover:bg-zinc-600 ${
          isHorizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
        } ${showSecondary ? "" : "hidden"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div
        className={`min-h-0 min-w-0 overflow-hidden ${showSecondary ? "flex-1" : "hidden"}`}
      >
        {secondary}
      </div>
    </div>
  );
}
