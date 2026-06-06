import type { TerminalCore } from "@wterm/core";

const WTERM_PADDING_PX = 12;

function cellFromPointer(
  el: HTMLElement,
  clientX: number,
  clientY: number,
  cols: number,
  rows: number,
): { row: number; col: number } {
  const rect = el.getBoundingClientRect();
  const styles = getComputedStyle(el);
  const padX =
    (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
  const padY =
    (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
  const innerWidth = Math.max(1, el.clientWidth - padX);
  const innerHeight = Math.max(1, el.clientHeight - padY);
  const x = clientX - rect.left - (parseFloat(styles.paddingLeft) || WTERM_PADDING_PX);
  const y = clientY - rect.top - (parseFloat(styles.paddingTop) || WTERM_PADDING_PX);
  const col = Math.min(cols - 1, Math.max(0, Math.floor((x / innerWidth) * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor((y / innerHeight) * rows)));
  return { row, col };
}

/** SGR mouse wheel (xterm 1006). */
function encodeSgrWheel(row: number, col: number, deltaY: number): string {
  const button = deltaY < 0 ? 64 : 65;
  return `\x1b[<${button};${col + 1};${row + 1}M`;
}

export function isTerminalAltScreen(bridge: TerminalCore | null | undefined): boolean {
  return bridge?.usingAltScreen?.() ?? false;
}

export function attachTerminalWheel(
  el: HTMLElement,
  getBridge: () => TerminalCore | null,
  sendData: (data: string) => void,
): () => void {
  const onWheel = (e: WheelEvent) => {
    const bridge = getBridge();
    if (!bridge) return;

    const altScreen = bridge.usingAltScreen();
    const hasDomScrollback =
      bridge.getScrollbackCount() > 0 && el.classList.contains("has-scrollback");

    if (altScreen) {
      e.preventDefault();
      e.stopPropagation();

      if (bridge.cursorKeysApp()) {
        sendData(e.deltaY < 0 ? "\x1bOA" : "\x1bOB");
        return;
      }

      const { row, col } = cellFromPointer(
        el,
        e.clientX,
        e.clientY,
        bridge.getCols(),
        bridge.getRows(),
      );
      sendData(encodeSgrWheel(row, col, e.deltaY));
      return;
    }

    if (hasDomScrollback) return;

    if (e.deltaY === 0) return;
    e.preventDefault();
    const seq = e.deltaY < 0 ? "\x1b[5~" : "\x1b[6~";
    sendData(seq);
  };

  el.addEventListener("wheel", onWheel, { passive: false });
  return () => el.removeEventListener("wheel", onWheel);
}
