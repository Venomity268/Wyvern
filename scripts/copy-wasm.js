const fs = require("fs");
const path = require("path");

fs.mkdirSync("public", { recursive: true });

// Copy wterm
const srcWterm = path.join("node_modules", "@wterm", "core", "wasm", "wterm.wasm");
const destWterm = path.join("public", "wterm.wasm");
fs.copyFileSync(srcWterm, destWterm);
console.log("Copied wterm.wasm to public/");

// Copy ghostty
const srcGhostty = path.join("node_modules", "@wterm", "ghostty", "wasm", "ghostty-vt.wasm");
const destGhostty = path.join("public", "ghostty-vt.wasm");
fs.copyFileSync(srcGhostty, destGhostty);
console.log("Copied ghostty-vt.wasm to public/");
