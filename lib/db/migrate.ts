import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

export function runMigrations(db: Database.Database) {
  migrateConnectionsProtocol(db);
  migrateWorkspaces(db);
  rebuildLegacyConnectionHistory(db);
  ensurePersonalWorkspaces(db);
  migrateUserProfile(db);
  migrateConnectionMethods(db);
  migrateConnectionMethodCredentials(db);
  migrateConnectionMethodsDropCredentialFk(db);
  migratePinnedConnections(db);
  migrateQuickSessions(db);
  migrateQuickSessionHistory(db);
  migrateConnectionWake(db);
  migrateConnectionHostInfo(db);
  migrateHostInfoMetrics(db);
  migrateFolders(db);
  migrateTotp(db);
  migrateUserAvatar(db);
}

function migrateUserAvatar(db: Database.Database) {
  const sql = tableSql(db, "users");
  if (!sql || sql.includes("avatar_updated_at")) return;
  db.exec("ALTER TABLE users ADD COLUMN avatar_updated_at TEXT");
}

function migrateTotp(db: Database.Database) {
  const sql = tableSql(db, "users");
  if (sql) {
    if (!sql.includes("totp_secret")) {
      db.exec("ALTER TABLE users ADD COLUMN totp_secret TEXT");
    }
    if (!sql.includes("totp_enabled")) {
      db.exec("ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0");
    }
  }
}

function migrateFolders(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_folders_workspace ON folders(workspace_id);
  `);

  const sql = tableSql(db, "connections");
  if (sql) {
    if (!sql.includes("folder_id")) {
      db.exec("ALTER TABLE connections ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL");
    }
    if (!sql.includes("tags")) {
      db.exec("ALTER TABLE connections ADD COLUMN tags TEXT");
    }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_connections_folder ON connections(folder_id);
  `);
}

function migrateQuickSessions(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quick_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      hostname TEXT NOT NULL,
      port INTEGER NOT NULL,
      protocol TEXT NOT NULL CHECK (protocol IN ('ssh', 'vnc', 'rdp')),
      username TEXT,
      encrypted_password TEXT,
      encrypted_private_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quick_sessions_user ON quick_sessions(user_id);
  `);
}

function migrateHostInfoMetrics(db: Database.Database) {
  const sql = tableSql(db, "connection_host_info");
  if (!sql) return;

  if (!sql.includes("memory_used_mb")) {
    db.exec("ALTER TABLE connection_host_info ADD COLUMN memory_used_mb INTEGER");
  }
  if (!sql.includes("memory_util_pct")) {
    db.exec("ALTER TABLE connection_host_info ADD COLUMN memory_util_pct REAL");
  }
  if (!sql.includes("disk_used_gb")) {
    db.exec("ALTER TABLE connection_host_info ADD COLUMN disk_used_gb REAL");
  }
  if (!sql.includes("disk_util_pct")) {
    db.exec("ALTER TABLE connection_host_info ADD COLUMN disk_util_pct REAL");
  }
  if (!sql.includes("cpu_util_pct")) {
    db.exec("ALTER TABLE connection_host_info ADD COLUMN cpu_util_pct REAL");
  }
  if (!sql.includes("metrics_json")) {
    db.exec("ALTER TABLE connection_host_info ADD COLUMN metrics_json TEXT");
  }
  if (!sql.includes("metrics_history_json")) {
    db.exec("ALTER TABLE connection_host_info ADD COLUMN metrics_history_json TEXT");
  }
}

function migrateConnectionHostInfo(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connection_host_info (
      connection_id TEXT PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
      fqdn TEXT,
      os_name TEXT,
      os_version TEXT,
      kernel TEXT,
      cpu_model TEXT,
      memory_total_mb INTEGER,
      disk_root_gb REAL,
      uptime_seconds INTEGER,
      collected_at TEXT NOT NULL DEFAULT (datetime('now')),
      collection_error TEXT,
      raw_json TEXT
    );
  `);
}

function migrateConnectionWake(db: Database.Database) {
  const connSql = tableSql(db, "connections");
  if (connSql && !connSql.includes("mac_address")) {
    db.exec("ALTER TABLE connections ADD COLUMN mac_address TEXT");
  }
  if (connSql && !connSql.includes("wol_broadcast")) {
    db.exec("ALTER TABLE connections ADD COLUMN wol_broadcast TEXT");
  }

  const quickSql = tableSql(db, "quick_sessions");
  if (quickSql && !quickSql.includes("mac_address")) {
    db.exec("ALTER TABLE quick_sessions ADD COLUMN mac_address TEXT");
  }
}

function migrateQuickSessionHistory(db: Database.Database) {
  const sql = tableSql(db, "connection_history");
  if (!sql || sql.includes("quick_session_id")) return;
  db.exec(
    "ALTER TABLE connection_history ADD COLUMN quick_session_id TEXT REFERENCES quick_sessions(id) ON DELETE SET NULL",
  );
}

function migratePinnedConnections(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pinned_connections (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      pinned_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, connection_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pinned_user ON pinned_connections(user_id);
  `);
}

function migrateConnectionMethodsDropCredentialFk(db: Database.Database) {
  const sql = tableSql(db, "connection_methods");
  if (!sql || !sql.includes("REFERENCES credentials")) return;

  db.exec(`
    BEGIN;
    CREATE TABLE connection_methods_new (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      protocol TEXT NOT NULL CHECK (protocol IN ('ssh', 'vnc', 'rdp')),
      port INTEGER NOT NULL,
      credential_id TEXT,
      UNIQUE(connection_id, protocol)
    );
    INSERT INTO connection_methods_new (id, connection_id, protocol, port, credential_id)
      SELECT id, connection_id, protocol, port, credential_id FROM connection_methods;
    DROP TABLE connection_methods;
    ALTER TABLE connection_methods_new RENAME TO connection_methods;
    CREATE INDEX IF NOT EXISTS idx_connection_methods_conn ON connection_methods(connection_id);
    COMMIT;
  `);
}

function migrateConnectionMethodCredentials(db: Database.Database) {
  const sql = tableSql(db, "connection_methods");
  if (!sql) return;

  if (!sql.includes("credential_id")) {
    db.exec("ALTER TABLE connection_methods ADD COLUMN credential_id TEXT");
  }

  db.exec(`
    UPDATE connection_methods
    SET credential_id = (
      SELECT credential_id FROM connections WHERE connections.id = connection_methods.connection_id
    )
    WHERE credential_id IS NULL
      AND EXISTS (
        SELECT 1 FROM connections c
        WHERE c.id = connection_methods.connection_id AND c.credential_id IS NOT NULL
      )
  `);
}

function migrateConnectionMethods(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connection_methods (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      protocol TEXT NOT NULL CHECK (protocol IN ('ssh', 'vnc', 'rdp')),
      port INTEGER NOT NULL,
      UNIQUE(connection_id, protocol)
    );
    CREATE INDEX IF NOT EXISTS idx_connection_methods_conn ON connection_methods(connection_id);
  `);

  const legacy = db
    .prepare(
      `SELECT c.id, c.protocol, c.port FROM connections c
       WHERE NOT EXISTS (SELECT 1 FROM connection_methods m WHERE m.connection_id = c.id)`,
    )
    .all() as { id: string; protocol: string; port: number }[];

  const insert = db.prepare(
    "INSERT OR IGNORE INTO connection_methods (id, connection_id, protocol, port) VALUES (?, ?, ?, ?)",
  );
  for (const row of legacy) {
    insert.run(uuidv4(), row.id, row.protocol, row.port);
  }
}

function migrateUserProfile(db: Database.Database) {
  const sql = tableSql(db, "users");
  if (!sql || sql.includes("display_name")) return;
  db.exec("ALTER TABLE users ADD COLUMN display_name TEXT");
}

function tableSql(db: Database.Database, name: string): string | undefined {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { sql: string } | undefined;
  return row?.sql;
}

function ensureWorkspaceTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_personal INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'member')) DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (workspace_id, user_id)
    );
  `);
}

function ensurePersonalWorkspaces(db: Database.Database) {
  const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
  for (const user of users) {
    const existing = db
      .prepare("SELECT id FROM workspaces WHERE owner_id = ? AND is_personal = 1")
      .get(user.id) as { id: string } | undefined;
    if (existing) continue;

    const wsId = uuidv4();
    db.prepare(
      "INSERT INTO workspaces (id, name, owner_id, is_personal) VALUES (?, 'Personal', ?, 1)",
    ).run(wsId, user.id);
    db.prepare(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')",
    ).run(wsId, user.id);
  }
}

function getOrCreatePersonalWorkspace(
  db: Database.Database,
  userId: string,
  personalByUser: Map<string, string>,
): string {
  const cached = personalByUser.get(userId);
  if (cached) return cached;

  const existing = db
    .prepare("SELECT id FROM workspaces WHERE owner_id = ? AND is_personal = 1")
    .get(userId) as { id: string } | undefined;
  if (existing) {
    personalByUser.set(userId, existing.id);
    return existing.id;
  }

  const wsId = uuidv4();
  db.prepare(
    "INSERT INTO workspaces (id, name, owner_id, is_personal) VALUES (?, 'Personal', ?, 1)",
  ).run(wsId, userId);
  db.prepare(
    "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')",
  ).run(wsId, userId);
  personalByUser.set(userId, wsId);
  return wsId;
}

function getOrCreateTeamSharedWorkspace(
  db: Database.Database,
  users: { id: string }[],
): string {
  const existing = db
    .prepare("SELECT id FROM workspaces WHERE name = 'Team Shared' AND is_personal = 0 LIMIT 1")
    .get() as { id: string } | undefined;
  if (existing) return existing.id;

  const sharedWsId = uuidv4();
  const firstAdmin = db
    .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1")
    .get() as { id: string } | undefined;
  const sharedOwner = firstAdmin?.id ?? users[0]?.id;
  if (!sharedOwner) return sharedWsId;

  db.prepare(
    "INSERT INTO workspaces (id, name, owner_id, is_personal) VALUES (?, 'Team Shared', ?, 0)",
  ).run(sharedWsId, sharedOwner);
  db.prepare(
    "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')",
  ).run(sharedWsId, sharedOwner);
  for (const user of users) {
    if (user.id !== sharedOwner) {
      const member = db
        .prepare(
          "SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
        )
        .get(sharedWsId, user.id);
      if (!member) {
        db.prepare(
          "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'member')",
        ).run(sharedWsId, user.id);
      }
    }
  }
  return sharedWsId;
}

function migrateWorkspaces(db: Database.Database) {
  const connSql = tableSql(db, "connections");
  if (!connSql) return;

  const credSql = tableSql(db, "credentials") ?? "";
  const histSql = tableSql(db, "connection_history") ?? "";

  const legacyConnections = connSql.includes("workspace TEXT");
  const legacyCredentials = credSql.includes("workspace TEXT");
  const legacyHistory =
    histSql.includes("workspace TEXT") ||
    (histSql.length > 0 && !histSql.includes("workspace_id"));

  if (!legacyConnections && !legacyCredentials && !legacyHistory) {
    return;
  }

  ensureWorkspaceTables(db);

  const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
  const personalByUser = new Map<string, string>();
  for (const user of users) {
    getOrCreatePersonalWorkspace(db, user.id, personalByUser);
  }

  const sharedWsId = getOrCreateTeamSharedWorkspace(db, users);

  if (legacyConnections || legacyCredentials) {
    if (legacyConnections && !connSql.includes("workspace_id")) {
      db.exec(
        "ALTER TABLE connections ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)",
      );
    }
    if (legacyCredentials && !credSql.includes("workspace_id")) {
      db.exec(
        "ALTER TABLE credentials ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)",
      );
    }

    if (legacyConnections) {
      const personalConns = db
        .prepare("SELECT id, owner_id FROM connections WHERE workspace = 'personal'")
        .all() as { id: string; owner_id: string | null }[];
      for (const row of personalConns) {
        const wsId = row.owner_id ? personalByUser.get(row.owner_id) : null;
        if (wsId) {
          db.prepare("UPDATE connections SET workspace_id = ? WHERE id = ?").run(wsId, row.id);
        }
      }
      db.prepare("UPDATE connections SET workspace_id = ? WHERE workspace = 'shared'").run(
        sharedWsId,
      );
    }

    if (legacyCredentials) {
      const personalCreds = db
        .prepare("SELECT id, owner_id FROM credentials WHERE workspace = 'personal'")
        .all() as { id: string; owner_id: string | null }[];
      for (const row of personalCreds) {
        const wsId = row.owner_id ? personalByUser.get(row.owner_id) : null;
        if (wsId) {
          db.prepare("UPDATE credentials SET workspace_id = ? WHERE id = ?").run(wsId, row.id);
        }
      }
      db.prepare("UPDATE credentials SET workspace_id = ? WHERE workspace = 'shared'").run(
        sharedWsId,
      );
    }

    if (legacyConnections) {
      db.exec(`
        BEGIN;
        CREATE TABLE connections_new (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          name TEXT NOT NULL,
          hostname TEXT NOT NULL,
          port INTEGER NOT NULL,
          protocol TEXT NOT NULL CHECK (protocol IN ('ssh', 'vnc', 'rdp')),
          username TEXT,
          credential_id TEXT REFERENCES credentials(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO connections_new
          SELECT id, workspace_id, owner_id, name, hostname, port, protocol, username, credential_id, created_at, updated_at
          FROM connections WHERE workspace_id IS NOT NULL;
        DROP TABLE connections;
        ALTER TABLE connections_new RENAME TO connections;
        COMMIT;
      `);
    }

    if (legacyCredentials) {
      db.exec(`
        BEGIN;
        CREATE TABLE credentials_new (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          label TEXT NOT NULL,
          username TEXT,
          encrypted_password TEXT,
          encrypted_private_key TEXT,
          encrypted_passphrase TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO credentials_new
          SELECT id, workspace_id, owner_id, label, username, encrypted_password, encrypted_private_key, encrypted_passphrase, created_at, updated_at
          FROM credentials WHERE workspace_id IS NOT NULL;
        DROP TABLE credentials;
        ALTER TABLE credentials_new RENAME TO credentials;
        COMMIT;
      `);
    }
  }

  if (legacyHistory) {
    if (!histSql.includes("workspace_id")) {
      db.exec(
        "ALTER TABLE connection_history ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)",
      );
    }

    if (histSql.includes("workspace TEXT")) {
      const historyRows = db
        .prepare("SELECT id, user_id, workspace FROM connection_history")
        .all() as { id: string; user_id: string; workspace: string }[];
      for (const row of historyRows) {
        const wsId =
          row.workspace === "shared"
            ? sharedWsId
            : personalByUser.get(row.user_id) ?? null;
        if (wsId) {
          db.prepare("UPDATE connection_history SET workspace_id = ? WHERE id = ?").run(
            wsId,
            row.id,
          );
        }
      }
    }

    rebuildLegacyConnectionHistory(db);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_connections_workspace ON connections(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_connections_owner ON connections(owner_id);
    CREATE INDEX IF NOT EXISTS idx_credentials_workspace ON credentials(workspace_id);
  `);
}

/** Drop legacy connection_history.workspace column (NOT NULL) after workspace_id backfill. */
function rebuildLegacyConnectionHistory(db: Database.Database) {
  const histSql = tableSql(db, "connection_history");
  if (!histSql?.includes("workspace TEXT")) return;

  ensureWorkspaceTables(db);

  if (!histSql.includes("workspace_id")) {
    db.exec(
      "ALTER TABLE connection_history ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)",
    );
  }

  const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
  const personalByUser = new Map<string, string>();
  for (const user of users) {
    personalByUser.set(user.id, getOrCreatePersonalWorkspace(db, user.id, personalByUser));
  }
  const sharedWsId = getOrCreateTeamSharedWorkspace(db, users);

  const historyRows = db
    .prepare(
      "SELECT id, user_id, workspace FROM connection_history WHERE workspace_id IS NULL",
    )
    .all() as { id: string; user_id: string; workspace: string }[];
  for (const row of historyRows) {
    const wsId =
      row.workspace === "shared"
        ? sharedWsId
        : personalByUser.get(row.user_id) ?? null;
    if (wsId) {
      db.prepare("UPDATE connection_history SET workspace_id = ? WHERE id = ?").run(wsId, row.id);
    }
  }

  db.exec(`
    BEGIN;
    CREATE TABLE connection_history_new (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connection_id TEXT REFERENCES connections(id) ON DELETE SET NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      protocol TEXT NOT NULL,
      connection_name TEXT,
      hostname TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      error_message TEXT
    );
    INSERT INTO connection_history_new
      SELECT id, user_id, connection_id, workspace_id, protocol, connection_name, hostname,
             started_at, ended_at, status, error_message
      FROM connection_history;
    DROP TABLE connection_history;
    ALTER TABLE connection_history_new RENAME TO connection_history;
    COMMIT;
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_history_user ON connection_history(user_id);
  `);
}

function migrateConnectionsProtocol(db: Database.Database) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'connections'")
    .get() as { sql: string } | undefined;

  if (!row?.sql || row.sql.includes("'rdp'")) return;

  db.exec(`
    BEGIN;
    CREATE TABLE connections_new (
      id TEXT PRIMARY KEY,
      workspace TEXT NOT NULL CHECK (workspace IN ('personal', 'shared')),
      owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      hostname TEXT NOT NULL,
      port INTEGER NOT NULL,
      protocol TEXT NOT NULL CHECK (protocol IN ('ssh', 'vnc', 'rdp')),
      username TEXT,
      credential_id TEXT REFERENCES credentials(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO connections_new SELECT * FROM connections;
    DROP TABLE connections;
    ALTER TABLE connections_new RENAME TO connections;
    CREATE INDEX IF NOT EXISTS idx_connections_workspace ON connections(workspace);
    CREATE INDEX IF NOT EXISTS idx_connections_owner ON connections(owner_id);
    COMMIT;
  `);
}
