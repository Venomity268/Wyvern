"use client";

import { useEffect, useRef } from "react";

/** Close the session WebSocket when the user navigates away or closes the tab. */
export function useDisconnectOnLeave(disconnect: () => void) {
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;

  useEffect(() => {
    const run = () => disconnectRef.current();

    window.addEventListener("pagehide", run);
    return () => {
      window.removeEventListener("pagehide", run);
      run();
    };
  }, []);
}
