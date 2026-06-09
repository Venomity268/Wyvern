import type { TerminalCore } from "@wterm/dom";

export interface TerminalSearchMatch {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  text: string;
}

/**
 * Searches the entire terminal buffer (scrollback + active screen) for a given query.
 * Row coordinates returned are the absolute DOM row indices:
 * - Scrollback rows: 0 to getScrollbackCount() - 1 (0 is oldest, getScrollbackCount()-1 is newest)
 * - Screen rows: getScrollbackCount() to getScrollbackCount() + getRows() - 1
 */
export function searchTerminalCore(core: TerminalCore, query: string, caseSensitive: boolean = false): TerminalSearchMatch[] {
  if (!query) return [];
  
  const matches: TerminalSearchMatch[] = [];
  const lowerQuery = caseSensitive ? query : query.toLowerCase();
  
  const rows = core.getRows();
  const cols = core.getCols();
  const scrollbackCount = core.getScrollbackCount();
  
  // We will build lines of text. Note that terminal text might wrap, but for simple searching
  // we will search line-by-line first. For cross-line search, we'd need to concatenate lines that don't end in newline.
  // For simplicity, let's just do line-by-line search initially.
  
  // 1. Search scrollback
  // offset 0 is the newest scrollback row, offset scrollbackCount - 1 is the oldest.
  // In the DOM, the oldest row is at index 0.
  // So domRow = scrollbackCount - 1 - offset.
  for (let offset = scrollbackCount - 1; offset >= 0; offset--) {
    const lineLen = core.getScrollbackLineLen(offset);
    if (lineLen === 0) continue;
    
    let lineStr = "";
    for (let c = 0; c < lineLen; c++) {
      const cell = core.getScrollbackCell(offset, c);
      lineStr += cell.char ? String.fromCharCode(cell.char) : " ";
    }
    
    const domRow = scrollbackCount - 1 - offset;
    findMatchesInLine(lineStr, lowerQuery, caseSensitive, domRow, matches);
  }
  
  // 2. Search active screen
  for (let r = 0; r < rows; r++) {
    let lineStr = "";
    for (let c = 0; c < cols; c++) {
      const cell = core.getCell(r, c);
      lineStr += cell.char ? String.fromCharCode(cell.char) : " ";
    }
    
    const domRow = scrollbackCount + r;
    findMatchesInLine(lineStr, lowerQuery, caseSensitive, domRow, matches);
  }
  
  return matches;
}

function findMatchesInLine(lineStr: string, query: string, caseSensitive: boolean, row: number, matches: TerminalSearchMatch[]) {
  const searchStr = caseSensitive ? lineStr : lineStr.toLowerCase();
  let startIndex = 0;
  
  while ((startIndex = searchStr.indexOf(query, startIndex)) !== -1) {
    matches.push({
      startRow: row,
      startCol: startIndex,
      endRow: row,
      endCol: startIndex + query.length,
      text: lineStr.substring(startIndex, startIndex + query.length)
    });
    startIndex += query.length;
  }
}
