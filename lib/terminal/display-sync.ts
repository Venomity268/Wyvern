import type { WTerm } from "@wterm/dom";
import type { TerminalCore } from "@wterm/core";
import { prepareScrollbackResync } from "@/lib/terminal/alt-screen";
import { afterTerminalRender, scrollTerminalToBottomIfPinned } from "@/lib/terminal/scroll";
import { isTerminalAltScreen } from "@/lib/terminal/wheel";

/** Post-render: scrollback restore after TUI exit, autoscroll in normal shell. */
export function syncTerminalDisplayAfterRender(
  wtermEl: HTMLElement | null,
  instance: WTerm | null | undefined,
  bridge: TerminalCore | null,
  wasAltScreen: boolean,
): boolean {
  if (!wtermEl || !bridge) return wasAltScreen;

  const onAltScreen = isTerminalAltScreen(bridge);
  if (onAltScreen) {
    return true;
  }

  if (wasAltScreen) {
    prepareScrollbackResync(instance);
  }

  scrollTerminalToBottomIfPinned(wtermEl);
  return false;
}

export function afterTerminalDisplaySync(
  wtermEl: HTMLElement | null,
  instance: WTerm | null | undefined,
  bridge: TerminalCore | null,
  wasAltScreenRef: { current: boolean },
): void {
  afterTerminalRender(() => {
    wasAltScreenRef.current = syncTerminalDisplayAfterRender(
      wtermEl,
      instance,
      bridge,
      wasAltScreenRef.current,
    );
  });
}
