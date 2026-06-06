import { useEffect } from "react";

/** Terminal-style copy/paste when focus is inside a wterm instance. */
export function useTerminalCopyPaste(
  active: boolean,
  sendInput: (text: string) => void,
) {
  useEffect(() => {
    if (!active) return;

    function onKeyDown(e: KeyboardEvent) {
      const inWterm =
        (e.target instanceof Element && !!e.target.closest(".wterm")) ||
        (document.activeElement instanceof Element &&
          !!document.activeElement.closest(".wterm"));

      if (!inWterm) return;

      const selected = window.getSelection()?.toString() ?? "";

      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "c" &&
        selected.length > 0
      ) {
        e.preventDefault();
        void navigator.clipboard.writeText(selected);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void navigator.clipboard.readText().then((text) => {
          if (text) sendInput(text);
        });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, sendInput]);
}
