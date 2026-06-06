const fs = require("fs");
const path = require("path");

fs.mkdirSync("public", { recursive: true });

const srcGhostty = path.join("node_modules", "@wterm", "ghostty", "wasm", "ghostty-vt.wasm");
const destGhostty = path.join("public", "ghostty-vt.wasm");
fs.copyFileSync(srcGhostty, destGhostty);
console.log("Copied ghostty-vt.wasm to public/");
