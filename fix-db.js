const db = require('better-sqlite3')('data/bastion.db');
db.exec(`CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  history_id TEXT NOT NULL REFERENCES connection_history(id) ON DELETE CASCADE,
  name TEXT,
  duration REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_recordings_history ON recordings(history_id);`);
console.log('Done');
