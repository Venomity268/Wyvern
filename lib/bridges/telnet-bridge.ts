import { WebSocket } from "ws";
import net from "net";
import { getDb } from "../db/index";
import { SessionUser } from "../auth/session-options";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import { registerSession, unregisterSession } from "../sessions/registry";
import { getRecordingCastPath, recordingFileExists } from "../recordings/paths";

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const MAX_SCROLLBACK = 200000;

interface TelnetInitMessage {
  connectionId?: string;
  quickSessionId?: string;
  sessionId?: string;
  cols?: number;
  rows?: number;
  hostname?: string;
  port?: number;
  username?: string;
  password?: string;
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function resolveHubKey(params: TelnetInitMessage): string | null {
  const targetId = params.quickSessionId || params.connectionId;
  if (targetId && params.sessionId) {
    return `telnet:${targetId}:${params.sessionId}`;
  }
  return targetId ? `telnet:${targetId}` : params.sessionId ? `telnet:${params.sessionId}` : null;
}

class TelnetHub {
  sessionId: string;
  user: SessionUser;
  tcpSocket: net.Socket | null = null;
  sockets = new Set<WebSocket>();
  scrollback: Buffer[] = [];
  scrollbackLen = 0;
  historyId: string | null = null;
  idleTimer: ReturnType<typeof setTimeout> | null = null;
  recordingStream: fs.WriteStream | null = null;
  recordingStartTime: number | null = null;
  recordingId: string | null = null;

  constructor(sessionId: string, user: SessionUser) {
    this.sessionId = sessionId;
    this.user = user;
  }

  addSocket(ws: WebSocket) {
    this.sockets.add(ws);

    // Send existing scrollback to new clients
    if (this.scrollback.length > 0) {
      const fullBuffer = Buffer.concat(this.scrollback);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(fullBuffer, { binary: true });
      }
    }

    this.resetIdleTimer();

    ws.on("message", (msg: Buffer | string | ArrayBuffer) => {
      this.handleSocketMessage(ws, msg);
    });

    ws.on("close", () => {
      this.sockets.delete(ws);
      if (this.sockets.size === 0) {
        this.resetIdleTimer();
      }
    });

    ws.on("error", () => {
      this.sockets.delete(ws);
      if (this.sockets.size === 0) {
        this.resetIdleTimer();
      }
    });
  }

  broadcast(chunk: Buffer) {
    if (this.recordingStream && this.recordingStartTime) {
      const delta = (Date.now() - this.recordingStartTime) / 1000;
      const entry = [delta, "o", chunk.toString("utf8")];
      this.recordingStream.write(JSON.stringify(entry) + "\n");
    }
    for (const ws of this.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk, { binary: true });
      }
    }
  }

  broadcastJson(payload: Record<string, unknown>) {
    const data = JSON.stringify(payload);
    for (const ws of this.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  appendScrollback(chunk: Buffer) {
    this.scrollback.push(chunk);
    this.scrollbackLen += chunk.length;
    while (this.scrollbackLen > MAX_SCROLLBACK && this.scrollback.length > 1) {
      const removed = this.scrollback.shift();
      if (removed) this.scrollbackLen -= removed.length;
    }
  }

  handleSocketMessage(ws: WebSocket, msg: Buffer | string | ArrayBuffer) {
    const input =
      typeof msg === "string"
        ? msg
        : Buffer.isBuffer(msg)
          ? msg.toString("utf-8")
          : Buffer.from(msg as ArrayBuffer).toString("utf-8");

    if (this.handleControlMessage(ws, input)) return;

    this.resetIdleTimer();
    if (this.tcpSocket && !this.tcpSocket.destroyed) {
      try {
        this.tcpSocket.write(input);
      } catch {
        // socket closed
      }
    }
  }

  handleControlMessage(_ws: WebSocket, input: string): boolean {
    if (!input.startsWith("{")) return false;
    try {
      const parsed = JSON.parse(input);
      if (!parsed.type) return false;

      if (parsed.type === "resize") {
        // Telnet doesn't support resize in raw TCP mode — NAWS negotiation
        // could be added later. For now, silently ignore.
        return true;
      }
      if (parsed.type === "toggle-recording") {
        if (this.recordingStream) {
          this.stopRecording();
        } else {
          this.startRecording(parsed.cols, parsed.rows);
        }
        return true;
      }
      if (parsed.type === "layout-sync") {
        // Forward layout sync to other sockets
        const data = JSON.stringify(parsed);
        for (const sock of this.sockets) {
          if (sock !== _ws && sock.readyState === WebSocket.OPEN) {
            sock.send(data);
          }
        }
        return true;
      }
    } catch {
      // not JSON
    }
    return false;
  }

  startRecording(cols: number = 120, rows: number = 40) {
    if (!this.historyId || this.recordingStream) return;
    const recordingId = uuidv4();
    const castPath = getRecordingCastPath(recordingId);

    try {
      const stream = fs.createWriteStream(castPath, { flags: "w" });
      stream.on("error", (err) => {
        console.error("Recording write error", err);
        if (this.recordingId === recordingId) {
          this.recordingStream = null;
          this.recordingId = null;
          this.recordingStartTime = null;
          this.broadcastJson({
            type: "recording-error",
            error: err instanceof Error ? err.message : "Recording failed",
          });
        }
      });

      this.recordingId = recordingId;
      this.recordingStartTime = Date.now();
      this.recordingStream = stream;

      const header = {
        version: 2,
        width: cols,
        height: rows,
        timestamp: Math.floor(Date.now() / 1000),
        env: { TERM: "xterm-256color" },
      };
      stream.write(JSON.stringify(header) + "\n");

      if (this.scrollback.length > 0) {
        const scrollbackText = Buffer.concat(this.scrollback).toString("utf8");
        if (scrollbackText) {
          const entry = [0.001, "o", scrollbackText];
          stream.write(JSON.stringify(entry) + "\n");
        }
      }

      this.broadcastJson({ type: "recording-started", recordingId });
    } catch (err) {
      console.error("Failed to start recording", err);
      this.recordingStream = null;
      this.recordingId = null;
      this.recordingStartTime = null;
      this.broadcastJson({
        type: "recording-error",
        error: err instanceof Error ? err.message : "Recording failed",
      });
    }
  }

  stopRecording() {
    if (!this.recordingStream || !this.recordingId || !this.historyId) return;

    const recordingId = this.recordingId;
    const historyId = this.historyId;
    const duration = this.recordingStartTime ? (Date.now() - this.recordingStartTime) / 1000 : 0;
    const stream = this.recordingStream;

    this.recordingStream = null;
    this.recordingId = null;
    this.recordingStartTime = null;

    stream.end(() => {
      if (!recordingFileExists(recordingId)) {
        console.warn("Recording file missing or empty, skipping metadata save:", recordingId);
        return;
      }

      try {
        getDb()
          .prepare("INSERT INTO recordings (id, history_id, name, duration) VALUES (?, ?, ?, ?)")
          .run(recordingId, historyId, `Recording ${new Date().toLocaleString()}`, duration);
        this.broadcastJson({ type: "recording-stopped", recordingId });
      } catch (e) {
        console.error("Failed to save recording metadata", e);
      }
    });
  }

  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.cleanup("completed", "Idle timeout");
    }, IDLE_TIMEOUT_MS);
  }

  cleanup(status: string, errorMessage?: string) {
    this.stopRecording();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.historyId) {
      unregisterSession(this.historyId);
      try {
        getDb()
          .prepare(
            "UPDATE connection_history SET ended_at = datetime('now'), status = ?, error_message = ? WHERE id = ?",
          )
          .run(status, errorMessage || null, this.historyId);
      } catch (err) {
        console.error("Failed to update history", err);
      }
      this.historyId = null;
    }
    if (this.tcpSocket) {
      this.tcpSocket.destroy();
      this.tcpSocket = null;
    }

    for (const ws of this.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        if (status === "error") {
          ws.send(JSON.stringify({ error: errorMessage || "Connection closed" }));
        } else {
          ws.close(1000, errorMessage || "Session ended");
        }
      }
    }
    this.sockets.clear();
    activeTelnetHubs.delete(this.sessionId);
  }
}

const activeTelnetHubs = new Map<string, TelnetHub>();

function resolveTelnetTarget(
  user: SessionUser,
  params: TelnetInitMessage,
): { hostname: string; port: number; name: string; connectionId?: string; workspaceId?: string } | { error: string } {
  if (params.quickSessionId) {
    const db = getDb();
    const qs = db
      .prepare("SELECT * FROM quick_sessions WHERE id = ? AND user_id = ?")
      .get(params.quickSessionId, user.id) as {
      hostname: string;
      port: number;
      label: string;
    } | undefined;
    if (!qs) return { error: "Quick session not found" };
    return { hostname: qs.hostname, port: qs.port, name: qs.label };
  }

  if (params.connectionId) {
    const db = getDb();
    const conn = db
      .prepare("SELECT * FROM connections WHERE id = ?")
      .get(params.connectionId) as {
      id: string;
      hostname: string;
      port: number;
      name: string;
      workspace_id: string;
    } | undefined;
    if (!conn) return { error: "Connection not found" };

    // Get the telnet method port if available
    const method = db
      .prepare("SELECT port FROM connection_methods WHERE connection_id = ? AND protocol = 'telnet'")
      .get(params.connectionId) as { port: number } | undefined;

    return {
      hostname: conn.hostname,
      port: method?.port ?? conn.port,
      name: conn.name,
      connectionId: conn.id,
      workspaceId: conn.workspace_id,
    };
  }

  // Direct hostname/port provided (e.g. from quick connect init message)
  if (params.hostname) {
    return {
      hostname: params.hostname,
      port: params.port || 23,
      name: `${params.hostname}:${params.port || 23}`,
    };
  }

  return { error: "Missing connection parameters" };
}

export function handleTelnetConnection(ws: WebSocket, user: SessionUser) {
  function onFirstMessage(data: Buffer | string) {
    ws.off("message", onFirstMessage);

    const text = typeof data === "string" ? data : data.toString("utf-8");
    let params: TelnetInitMessage;
    try {
      params = JSON.parse(text);
    } catch {
      ws.send(JSON.stringify({ error: "Invalid connection parameters" }));
      ws.close();
      return;
    }

    const sessionId = resolveHubKey(params);
    if (!sessionId) {
      ws.send(JSON.stringify({ error: "Missing connection or session ID" }));
      ws.close();
      return;
    }

    const existingHub = activeTelnetHubs.get(sessionId);
    if (existingHub) {
      existingHub.addSocket(ws);
      return;
    }

    const resolved = resolveTelnetTarget(user, params);
    if ("error" in resolved) {
      ws.send(JSON.stringify({ error: resolved.error }));
      ws.close();
      return;
    }

    const hub = new TelnetHub(sessionId, user);
    activeTelnetHubs.set(sessionId, hub);
    hub.addSocket(ws);

    // Record history
    hub.historyId = uuidv4();
    const isQuick = !!params.quickSessionId;
    try {
      getDb()
        .prepare(
          `INSERT INTO connection_history
            (id, user_id, connection_id, quick_session_id, workspace_id, protocol, connection_name, hostname, status)
           VALUES (?, ?, ?, ?, ?, 'telnet', ?, ?, 'active')`,
        )
        .run(
          hub.historyId,
          user.id,
          isQuick ? null : resolved.connectionId || null,
          isQuick ? params.quickSessionId : null,
          resolved.workspaceId || null,
          resolved.name,
          resolved.hostname,
        );
    } catch (err) {
      console.error("Failed to insert telnet history", err);
    }

    registerSession(hub.historyId, {
      close: () => {
        hub.cleanup("completed", "Ended remotely");
      },
      connectionId: params.quickSessionId || resolved.connectionId || sessionId,
      userId: user.id,
    });

    // Connect raw TCP socket
    const tcpSocket = net.createConnection(
      { host: resolved.hostname, port: resolved.port },
      () => {
        hub.broadcast(
          Buffer.from(
            `\r\n\x1b[32mConnected to ${resolved.hostname}:${resolved.port} (Telnet)\x1b[0m\r\n\r\n`,
          ),
        );
      },
    );

    hub.tcpSocket = tcpSocket;

    tcpSocket.on("data", (chunk: Buffer) => {
      hub.resetIdleTimer();
      hub.appendScrollback(chunk);
      hub.broadcast(chunk);
    });

    tcpSocket.on("close", () => {
      hub.cleanup("completed");
    });

    tcpSocket.on("error", (err) => {
      const msg = Buffer.from(`\r\n\x1b[31mTelnet error: ${err.message}\x1b[0m\r\n`);
      hub.broadcast(msg);
      hub.cleanup("error", err.message);
    });

    tcpSocket.on("timeout", () => {
      hub.broadcast(Buffer.from(`\r\n\x1b[33mTelnet connection timed out\x1b[0m\r\n`));
      hub.cleanup("completed", "Connection timed out");
    });

    // Set a connection timeout
    tcpSocket.setTimeout(30000); // 30s connect timeout, removed after connect
    tcpSocket.once("connect", () => {
      tcpSocket.setTimeout(0); // Remove timeout after successful connect
    });
  }

  ws.on("message", onFirstMessage);

  ws.on("close", () => {
    // socket will be removed by hub if attached
  });

  ws.on("error", () => {
    // socket will be removed by hub if attached
  });
}
