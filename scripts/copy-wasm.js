const fs = require("fs");
const path = require("path");

const src = path.join("node_modules", "@wterm", "core", "wasm", "wterm.wasm");
const dest = path.join("public", "wterm.wasm");

fs.mkdirSync("public", { recursive: true });
fs.copyFileSync(src, dest);
console.log("Copied wterm.wasm to public/");
