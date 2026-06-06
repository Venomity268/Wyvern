import type { CellData } from "@wterm/core";
import type { WTerm } from "@wterm/dom";
import type { TerminalCore } from "@wterm/core";

type WTermRenderer = {
  rows: number;
  cols: number;
  rowEls?: HTMLElement[];
  container?: HTMLElement;
  prevContainerBg?: string;
  prevCursorRow?: number;
  prevCursorCol?: number;
  prevRowBg?: string[];
  _renderedScrollbackCount: number;
  _scrollbackRowEls: HTMLElement[];
  setup?: (cols: number, rows: number) => void;
  _buildRowContent?: (
    rowEl: HTMLElement,
    getCell: (col: number) => CellData,
    lineLen: number,
    cursorCol: number,
    rowIndex: number,
  ) => void;
  render?: (core: TerminalCore) => void;
};

type WTermInternals = {
  renderer?: WTermRenderer | null;
  bridge?: TerminalCore | null;
  element?: HTMLElement;
  _doRender?: () => void;
};

const PATCHED = Symbol("wtermAltScreenPatch");

function asInternals(instance: WTerm | null | undefined): WTermInternals | null {
  if (!instance) return null;
  return instance as unknown as WTermInternals;
}

function getRenderer(instance: WTerm | null | undefined): WTermRenderer | null {
  return asInternals(instance)?.renderer ?? null;
}

/** Hide primary-buffer scrollback in the DOM while a TUI owns the alt screen. */
export function fixAltScreenDom(
  wtermEl: HTMLElement,
  instance: WTerm | null | undefined,
  bridge: TerminalCore,
): void {
  if (!bridge.usingAltScreen()) return;

  wtermEl.classList.remove("has-scrollback");
  wtermEl.scrollTop = 0;

  wtermEl.querySelectorAll(".term-scrollback-row").forEach((row) => row.remove());

  const renderer = getRenderer(instance);
  if (renderer) {
    renderer._renderedScrollbackCount = bridge.getScrollbackCount();
    renderer._scrollbackRowEls = [];
  }
}

function paintAllRows(renderer: WTermRenderer, core: TerminalCore): void {
  if (!renderer.rowEls || !renderer._buildRowContent) return;

  const cursor = core.getCursor();
  for (let r = 0; r < renderer.rows; r++) {
    const cursorCol = r === cursor.row && cursor.visible ? cursor.col : -1;
    renderer._buildRowContent(
      renderer.rowEls[r],
      (col: number) => core.getCell(r, col),
      renderer.cols,
      cursorCol,
      r,
    );
  }
  renderer.prevCursorRow = cursor.row;
  renderer.prevCursorCol = cursor.col;
}

function renderAltScreenFull(
  renderer: WTermRenderer,
  core: TerminalCore,
  wtermEl: HTMLElement,
  instance: WTerm | null | undefined,
): void {
  fixAltScreenDom(wtermEl, instance, core);

  const rows = core.getRows();
  const cols = core.getCols();
  if (rows !== renderer.rows || cols !== renderer.cols) {
    renderer.setup?.(cols, rows);
  }

  paintAllRows(renderer, core);
  core.clearDirty();
}

/** After leaving alt screen, allow wterm to rebuild scrollback rows on the next render. */
export function prepareScrollbackResync(instance: WTerm | null | undefined): void {
  const renderer = getRenderer(instance);
  if (!renderer) return;
  renderer._renderedScrollbackCount = 0;
  renderer._scrollbackRowEls = [];
}

/**
 * Patch wterm to full-paint on alt screen inside its render cycle (no async race).
 * Also prevents wterm from enabling DOM scrollback while a TUI is active.
 */
export function installAltScreenRenderPatch(
  instance: WTerm | null | undefined,
  wtermEl: HTMLElement,
): void {
  const internals = asInternals(instance);
  const renderer = internals?.renderer;
  if (!internals || !renderer?.render || (renderer as { [PATCHED]?: boolean })[PATCHED]) {
    return;
  }

  const originalRender = renderer.render.bind(renderer);
  renderer.render = (core: TerminalCore) => {
    if (core.usingAltScreen()) {
      renderAltScreenFull(renderer, core, wtermEl, instance);
      return;
    }
    originalRender(core);
  };

  if (internals._doRender && !(internals as { [PATCHED]?: boolean })[PATCHED]) {
    const originalDoRender = internals._doRender.bind(instance);
    internals._doRender = () => {
      originalDoRender();
      const bridge = internals.bridge;
      if (bridge?.usingAltScreen() && internals.element) {
        internals.element.classList.remove("has-scrollback");
        internals.element.scrollTop = 0;
      }
    };
  }

  (renderer as { [PATCHED]?: boolean })[PATCHED] = true;
  (internals as { [PATCHED]?: boolean })[PATCHED] = true;
}
