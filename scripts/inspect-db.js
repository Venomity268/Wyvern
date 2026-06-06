const Database = require("better-sqlite3");
const db = new Database("data/bastion.db");
console.log(
  "tables:",
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),
);
for (const t of ["connections", "credentials", "connection_history", "workspaces"]) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(t);
  console.log(`\n${t}:`, row?.sql || "(missing)");
}
