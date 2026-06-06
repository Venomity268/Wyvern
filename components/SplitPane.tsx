"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SplitPaneProps {
  direction?: "horizontal" | "vertical";
  initialRatio?: number;
  minPrimary?: number;
  minSecondary?: number;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  showSecondary: boolean;
}

export function SplitPane({
  direction = "horizontal",
  initialRatio = 0.65,
  minPrimary = 200,
  minSecondary = 200,
  primary,
  secondary,
  showSecondary,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(initialRatio);
  const draggingRef = useRef(false);

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

  useEffect(() => {
    if (!showSecondary) setRatio(initialRatio);
  }, [showSecondary, initialRatio]);

  const isHorizontal = direction === "horizontal";

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
