"use client";

import { useSyncExternalStore } from "react";

export function useIsMobile(breakpoint = 768) {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    () => {
      if (typeof window === "undefined") return false;
      return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
    },
    () => false
  );
}
