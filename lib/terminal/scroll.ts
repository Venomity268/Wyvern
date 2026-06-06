const PINNED_THRESHOLD_PX = 8;

export function isTerminalPinnedToBottom(el: HTMLElement | null): boolean {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= PINNED_THRESHOLD_PX;
}

/** Row-aligned scroll-to-bottom matching @wterm/dom behavior. */
export function scrollTerminalToBottom(el: HTMLElement | null): void {
  if (!el) return;
  const maxScroll = el.scrollHeight - el.clientHeight;
  if (maxScroll <= 0) {
    el.scrollTop = 0;
    return;
  }
  const rowHeight =
    parseFloat(getComputedStyle(el).getPropertyValue("--term-row-height")) || 17;
  el.scrollTop = Math.floor(maxScroll / rowHeight) * rowHeight;
}

export function scrollTerminalToBottomIfPinned(el: HTMLElement | null): void {
  if (!isTerminalPinnedToBottom(el)) return;
  scrollTerminalToBottom(el);
}

/** Run after wterm's async render pass completes. */
export function afterTerminalRender(fn: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}
