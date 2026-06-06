import type Database from "better-sqlite3";

export interface EmbeddedSshTarget {
  connectionId: string;
  name: string;
  hostname: string;
  username: string | null;
  credential_id: string | null;
}

function rowHasSshAccess(
  db: Database.Database,
  connectionId: string,
  legacyProtocol: string,
): boolean {
  const hasMethod = db
    .prepare(
      "SELECT 1 FROM connection_methods WHERE connection_id = ? AND protocol = 'ssh' LIMIT 1",
    )
    .get(connectionId);
  return !!hasMethod || legacyProtocol === "ssh";
}

export function findEmbeddedSshTarget(
  db: Database.Database,
  userId: string,
  connection: {
    id: string;
    name: string;
    workspace_id: string;
    hostname: string;
    username: string | null;
    credential_id: string | null;
    protocol: string;
  },
): EmbeddedSshTarget | null {
  if (rowHasSshAccess(db, connection.id, connection.protocol)) {
    return {
      connectionId: connection.id,
      name: connection.name,
      hostname: connection.hostname,
      username: connection.username,
      credential_id: connection.credential_id,
    };
  }

  const sibling = db
    .prepare(
      `SELECT c.id, c.name, c.hostname, c.username, c.credential_id, c.protocol
       FROM connections c
       INNER JOIN workspace_members wm ON wm.workspace_id = c.workspace_id AND wm.user_id = ?
       WHERE c.hostname = ? AND c.workspace_id = ? AND c.id != ?
         AND (
           EXISTS (SELECT 1 FROM connection_methods m WHERE m.connection_id = c.id AND m.protocol = 'ssh')
           OR c.protocol = 'ssh'
         )
       ORDER BY c.name ASC
       LIMIT 1`,
    )
    .get(userId, connection.hostname, connection.workspace_id, connection.id) as
    | {
        id: string;
        name: string;
        hostname: string;
        username: string | null;
        credential_id: string | null;
        protocol: string;
      }
    | undefined;

  if (!sibling || !rowHasSshAccess(db, sibling.id, sibling.protocol)) {
    return null;
  }

  return {
    connectionId: sibling.id,
    name: sibling.name,
    hostname: sibling.hostname,
    username: sibling.username,
    credential_id: sibling.credential_id,
  };
}
