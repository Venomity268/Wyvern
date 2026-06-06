import { getDb } from "../lib/db/index";

const db = getDb();
console.log("migration ok");

const historyCols = db.prepare("PRAGMA table_info(connection_history)").all() as {
  name: string;
}[];
const connCols = db.prepare("PRAGMA table_info(connections)").all() as { name: string }[];

console.log(
  "connection_history cols:",
  historyCols.map((c) => c.name).join(", "),
);
console.log("connections cols:", connCols.map((c) => c.name).join(", "));
