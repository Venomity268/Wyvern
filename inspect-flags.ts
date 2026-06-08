import { GhosttyCore } from "./node_modules/@wterm/ghostty/dist/ghostty-core.js";

async function main() {
  const core = await GhosttyCore.load({
    wasmPath: "http://localhost:3000/ghostty-vt.wasm"
  });
  
  core.init(80, 24);

  // Write colors: \x1b[31m Red, \x1b[32m Green, \x1b[38;5;6m Cyan (palette index 6)
  // And a background color \x1b[41m Red BG, \x1b[48;5;12m Blue BG (palette index 12)
  core.writeString("\x1b[31mRedText\x1b[32mGreenText\x1b[38;5;6mCyanText\x1b[0m\x1b[41mRedBG\x1b[48;5;12mBlueBG\x1b[0m");

  // Let's inspect the cells at different positions:
  // RedText is at col 0
  // GreenText is at col 7
  // CyanText is at col 16
  // RedBG is at col 24
  // BlueBG is at col 29

  // We want to see raw parsed cell fields as well as getCell return values
  // To see raw fields, let's call the internal WASM reader or inspect the view
  console.log("RedText (col 0) getCell:", core.getCell(0, 0));
  console.log("GreenText (col 7) getCell:", core.getCell(0, 7));
  console.log("CyanText (col 16) getCell:", core.getCell(0, 16));
  console.log("RedBG (col 24) getCell:", core.getCell(0, 24));
  console.log("BlueBG (col 29) getCell:", core.getCell(0, 29));
}

main().catch(console.error);
