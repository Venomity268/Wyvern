import { useEffect } from "react";

function isTerminalInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (!target.closest(".wterm")) return false;
  if (target.tagName === "TEXTAREA" && target.getAttribute("aria-hidden") === "true") {
    return true;
  }
  return target.closest(".ssh-terminal-host") !== null && target.classList.contains("wterm");
}

function isVisibleEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "SELECT") return true;

  if (tag === "TEXTAREA") {
    const inWterm = target.closest(".wterm") !== null;
    const hidden = target.getAttribute("aria-hidden") === "true";
    return !inWterm || !hidden;
  }

  return false;
}

function forwardBackspaceToWterm() {
  const wterm =
    document.querySelector<HTMLElement>(".wterm.focused") ??
    document.querySelector<HTMLElement>(".ssh-terminal-host:not(.hidden) .wterm");

  if (!wterm) return;

  const textarea = wterm.querySelector("textarea");
  if (!(textarea instanceof HTMLTextAreaElement)) return;

  if (document.activeElement !== textarea) {
    textarea.focus();
  }

  textarea.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Backspace",
      code: "Backspace",
      bubbles: true,
      cancelable: true,
    }),
  );
}

/**
 * Stops Chromium/Firefox from navigating back on Backspace when focus is not
 * in a visible form field. Optionally forwards the key to a custom handler
 * (e.g. Guacamole) or the focused wterm instance.
 */
export function usePreventBackspaceNavigation(
  active: boolean,
  onBackspace?: () => void,
) {
  useEffect(() => {
    if (!active) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Backspace") return;
      if (isVisibleEditableTarget(e.target)) return;
      if (isTerminalInputTarget(e.target)) {
        e.preventDefault();
        return;
      }

      e.preventDefault();

      if (onBackspace) {
        onBackspace();
        return;
      }

      forwardBackspaceToWterm();
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [active, onBackspace]);
}
