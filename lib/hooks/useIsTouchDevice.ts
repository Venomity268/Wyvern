"use client";

import { useSyncExternalStore } from "react";

function getTouchDeviceSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

export function useIsTouchDevice() {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const media = window.matchMedia("(pointer: coarse)");
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    getTouchDeviceSnapshot,
    () => false,
  );
}
