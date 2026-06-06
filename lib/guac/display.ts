export type ZoomMode = "fit" | "actual";

export interface GuacDisplayLike {
  getElement: () => HTMLElement;
  getWidth: () => number;
  getHeight: () => number;
  getScale: () => number;
  scale: (scale: number) => void;
}

export function applyDisplayLayout(
  display: GuacDisplayLike,
  containerEl: HTMLElement,
  mode: ZoomMode,
): void {
  const displayW = display.getWidth();
  const displayH = display.getHeight();
  if (!displayW || !displayH) return;

  const containerW = containerEl.clientWidth;
  const containerH = containerEl.clientHeight;
  const displayEl = display.getElement();
  displayEl.style.marginLeft = "0";
  displayEl.style.marginTop = "0";

  let scale = 1;
  if (mode === "fit") {
    scale = Math.min(containerW / displayW, containerH / displayH);
    containerEl.style.overflow = "hidden";
  } else {
    containerEl.style.overflow = "auto";
  }

  display.scale(scale);

  const scaledW = displayW * scale;
  const scaledH = displayH * scale;
  displayEl.style.marginLeft = `${Math.max(0, (containerW - scaledW) / 2)}px`;
  displayEl.style.marginTop = `${Math.max(0, (containerH - scaledH) / 2)}px`;
}
