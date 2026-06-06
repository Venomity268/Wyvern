type SessionCloser = () => void;

export interface SessionRecord {
  close: SessionCloser;
  connectionId: string | null;
  userId: string;
}

const activeSessions = new Map<string, SessionRecord>();

export function registerSession(historyId: string, record: SessionRecord) {
  activeSessions.set(historyId, record);
}

export function unregisterSession(historyId: string) {
  activeSessions.delete(historyId);
}

export function getLiveSessionIds(): string[] {
  return [...activeSessions.keys()];
}

export function isLiveSession(historyId: string): boolean {
  return activeSessions.has(historyId);
}

/** Close a live session if one is registered. Returns true if a live session was found. */
export function closeLiveSession(historyId: string): boolean {
  const record = activeSessions.get(historyId);
  if (!record) return false;
  record.close();
  return true;
}

export function closeLiveSessionsForConnection(userId: string, connectionId: string): number {
  let closed = 0;
  for (const [historyId, record] of [...activeSessions.entries()]) {
    if (record.userId === userId && record.connectionId === connectionId) {
      record.close();
      activeSessions.delete(historyId);
      closed += 1;
    }
  }
  return closed;
}
