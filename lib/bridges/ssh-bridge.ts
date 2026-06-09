import { WebSocket } from "ws";
import { Client } from "ssh2";
import { getDb } from "../db/index";
import { resolveSshConnection } from "./ssh-connect";
import { resolveQuickSsh } from "../quick-connect";
import { SessionUser } from "../auth/session-options";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import {
  getForwardListenHost,
  startSshForward,
  stopAllForwards,
  stopSshForward,
  type SshForward,
} from "./ssh-forwards";
import { registerSession, unregisterSession } from "../sessions/registry";
import { normalizePrivateKeyForSsh2 } from "../ssh/ssh-keys";

class InMemoryVaultAgent extends (require("ssh2").BaseAgent as any) {
  private keys: any[];

  constructor(keys: any[]) {
    super();
    this.keys = keys;
  }

  getIdentities(cb: (err: any, keys: any[]) => void) {
    const identities = this.keys.map((k: any) => ({
      pubKey: k.getPublicSSH(),
      comment: "in-memory-vault-key",
    }));
    cb(null, identities);
  }

  sign(pubKey: Buffer, data: Buffer, cb: (err: any, signature: Buffer) => void) {
    const key = this.keys.find((k: any) => k.getPublicSSH().equals(pubKey));
    if (!key) {
      return cb(new Error("Key not found in vault"), null as any);
    }
    try {
      const signature = key.sign(data);
      cb(null, signature);
    } catch (err) {
      cb(err, null as any);
    }
  }
}

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const MAX_SCROLLBACK = 200000;

interface SshInitMessage {
  connectionId?: string;
  quickSessionId?: string;
  sessionId?: string;
  mode?: "shell" | "tunnel";
  cols?: number;
  rows?: number;
  password?: string;
  privateKey?: string;
  username?: string;
  execCommand?: string;
}

interface ForwardAddMessage {
  type: "forward-add";
  id?: string;
  remoteHost: string;
  remotePort: number;
  localPort?: number;
  listenHost?: string;
}

interface ForwardRemoveMessage {
  type: "forward-remove";
  id: string;
}

interface ZmodemStartMessage {
  type: "zmodem-start";
  direction: "send" | "receive";
}

interface ZmodemEndMessage {
  type: "zmodem-end";
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

class SessionHub {
  sessionId: string;
  user: SessionUser;
  mode: "shell" | "tunnel";
  sshClient: Client | null = null;
  shellStream: import("ssh2").ClientChannel | null = null;
  sockets = new Set<WebSocket>();
  scrollback: Buffer[] = [];
  scrollbackLen = 0;
  historyId: string | null = null;
  idleTimer: ReturnType<typeof setTimeout> | null = null;
  forwards = new Map<string, SshForward>();
  zmodemActive = false;
  latestLayout: any = null;
  recordingStream: fs.WriteStream | null = null;
  recordingStartTime: number | null = null;
  recordingId: string | null = null;

  constructor(sessionId: string, user: SessionUser, mode: "shell" | "tunnel") {
    this.sessionId = sessionId;
    this.user = user;
    this.mode = mode;
  }

  addSocket(ws: WebSocket) {
    this.sockets.add(ws);
    
    if (this.mode === "shell" && this.scrollback.length > 0) {
      const fullBuffer = Buffer.concat(this.scrollback);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(fullBuffer, { binary: true });
      }
    } else if (this.mode === "tunnel" && this.sshClient) {
      sendJson(ws, { type: "ready", listenHost: getForwardListenHost() });
    }

    if (this.latestLayout && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(this.latestLayout));
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
    if (msg instanceof ArrayBuffer || Buffer.isBuffer(msg)) {
      const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);
      if (this.zmodemActive && this.shellStream) {
        this.resetIdleTimer();
        this.shellStream.write(buf);
        return;
      }
    }

    const input =
      typeof msg === "string"
        ? msg
        : Buffer.isBuffer(msg)
          ? msg.toString("utf-8")
          : Buffer.from(msg as ArrayBuffer).toString("utf-8");

    if (this.handleControlMessage(ws, input)) return;

    this.resetIdleTimer();
    if (this.shellStream) {
      try {
        this.shellStream.write(input);
      } catch {
        // stream closed
      }
    }
  }

  handleControlMessage(ws: WebSocket, input: string): boolean {
    if (!input.startsWith("{")) return false;
    try {
      const parsed = JSON.parse(input);
      if (!parsed.type) return false;

      if (parsed.type === "forward-add") {
        void this.handleForwardAdd(ws, parsed as unknown as ForwardAddMessage);
        return true;
      }
      if (parsed.type === "forward-remove") {
        this.handleForwardRemove(ws, parsed as unknown as ForwardRemoveMessage);
        return true;
      }
      if (parsed.type === "layout-sync") {
        this.latestLayout = parsed;
        const data = JSON.stringify(parsed);
        for (const sock of this.sockets) {
          if (sock !== ws && sock.readyState === WebSocket.OPEN) {
            sock.send(data);
          }
        }
        return true;
      }
      if (parsed.type === "forward-list") {
        this.handleForwardList(ws);
        return true;
      }
      if (parsed.type === "resize" && this.shellStream && parsed.cols && parsed.rows) {
        this.shellStream.setWindow(
          Number(parsed.rows),
          Number(parsed.cols),
          0,
          0,
        );
        return true;
      }
      if (parsed.type === "zmodem-start") {
        this.zmodemActive = true;
        return true;
      }
      if (parsed.type === "zmodem-end") {
        this.zmodemActive = false;
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
    } catch {
      // not JSON
    }
    return false;
  }

  async handleForwardAdd(ws: WebSocket, msg: ForwardAddMessage) {
    if (!this.sshClient) return;
    const requestId = msg.id || uuidv4();
    try {
      const forward = await startSshForward(
        this.sshClient,
        msg.remoteHost,
        msg.remotePort,
        msg.localPort,
        msg.listenHost,
      );
      this.forwards.set(forward.id, forward);
      sendJson(ws, {
        type: "forward-added",
        requestId,
        forwardId: forward.id,
        listenHost: forward.listenHost,
        localPort: forward.localPort,
      });
      this.handleForwardList(ws);
    } catch (err) {
      sendJson(ws, {
        type: "forward-error",
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  handleForwardRemove(ws: WebSocket, msg: ForwardRemoveMessage) {
    const forward = this.forwards.get(msg.id);
    if (forward) {
      stopSshForward(forward);
      this.forwards.delete(msg.id);
      sendJson(ws, { type: "forward-removed", forwardId: msg.id });
      this.handleForwardList(ws);
    }
  }

  handleForwardList(ws?: WebSocket) {
    const list = Array.from(this.forwards.values()).map((f) => ({
      id: f.id,
      listenHost: f.listenHost,
      localPort: f.localPort,
      remoteHost: f.remoteHost,
      remotePort: f.remotePort,
    }));
    const payload = { type: "forward-list", forwards: list };
    if (ws) sendJson(ws, payload);
    else this.broadcastJson(payload);
  }

  startRecording(cols: number = 120, rows: number = 40) {
    if (!this.historyId) return;
    this.recordingId = uuidv4();
    this.recordingStartTime = Date.now();
    const p = path.join(process.cwd(), "data", "recordings", `${this.recordingId}.cast`);
    this.recordingStream = fs.createWriteStream(p, { flags: "w" });
    const header = {
      version: 2,
      width: cols,
      height: rows,
      timestamp: Math.floor(Date.now() / 1000),
      env: { TERM: "xterm-256color" }
    };
    this.recordingStream.write(JSON.stringify(header) + "\n");

    if (this.scrollback.length > 0) {
      const scrollbackText = Buffer.concat(this.scrollback).toString("utf8");
      if (scrollbackText) {
        const entry = [0.001, "o", scrollbackText];
        this.recordingStream.write(JSON.stringify(entry) + "\n");
      }
    }

    this.broadcastJson({ type: "recording-started", recordingId: this.recordingId });
  }

  stopRecording() {
    if (this.recordingStream && this.recordingId && this.historyId) {
      this.recordingStream.end();
      this.recordingStream = null;
      const duration = this.recordingStartTime ? (Date.now() - this.recordingStartTime) / 1000 : 0;
      try {
        getDb().prepare("INSERT INTO recordings (id, history_id, name, duration) VALUES (?, ?, ?, ?)").run(
          this.recordingId, this.historyId, `Recording ${new Date().toLocaleString()}`, duration
        );
      } catch (e) {
        console.error("Failed to save recording metadata", e);
      }
      this.broadcastJson({ type: "recording-stopped", recordingId: this.recordingId });
      this.recordingId = null;
      this.recordingStartTime = null;
    }
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
    stopAllForwards(this.forwards);
    this.shellStream?.end();
    this.shellStream = null;
    this.sshClient?.end();
    this.sshClient = null;

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
    activeHubs.delete(this.sessionId);
  }
}

const activeHubs = new Map<string, SessionHub>();

export function handleSshConnection(ws: WebSocket, user: SessionUser) {
  function onFirstMessage(data: Buffer | string) {
    ws.off("message", onFirstMessage);

    const text = typeof data === "string" ? data : data.toString("utf-8");
    let params: SshInitMessage;
    try {
      params = JSON.parse(text);
    } catch {
      ws.send(JSON.stringify({ error: "Invalid connection parameters" }));
      ws.close();
      return;
    }

    const sessionId = params.sessionId || params.connectionId || params.quickSessionId;
    if (!sessionId) {
      ws.send(JSON.stringify({ error: "Missing connection or session ID" }));
      ws.close();
      return;
    }

    const existingHub = activeHubs.get(sessionId);
    if (existingHub) {
      existingHub.addSocket(ws);
      return;
    }

    const mode = params.mode || "shell";
    const resolved = params.quickSessionId
      ? resolveQuickSsh(user, params.quickSessionId, {
          username: params.username,
          password: params.password,
          privateKey: params.privateKey,
        })
      : resolveSshConnection(user, params.connectionId, {
          username: params.username,
          password: params.password,
          privateKey: params.privateKey,
        });

    if ("error" in resolved) {
      ws.send(
        JSON.stringify({
          error: resolved.error,
          needsAuth: resolved.needsAuth,
        }),
      );
      if (resolved.needsAuth) {
        setTimeout(() => ws.close(), 100);
      } else {
        ws.close();
      }
      return;
    }

    const hub = new SessionHub(sessionId, user, mode);
    activeHubs.set(sessionId, hub);
    hub.addSocket(ws);

    const connection = resolved.connection;
    const username = resolved.username;
    const password = resolved.password;
    const privateKey = resolved.privateKey;
    const passphrase = resolved.passphrase;

    hub.historyId = uuidv4();
    const isQuick = !!params.quickSessionId;
    try {
      getDb()
        .prepare(
          `INSERT INTO connection_history
            (id, user_id, connection_id, quick_session_id, workspace_id, protocol, connection_name, hostname, status)
           VALUES (?, ?, ?, ?, ?, 'ssh', ?, ?, 'active')`,
        )
        .run(
          hub.historyId,
          user.id,
          isQuick ? null : connection.id,
          isQuick ? params.quickSessionId : null,
          isQuick ? null : connection.workspace_id || null,
          connection.name,
          connection.hostname,
        );
    } catch (err) {
      console.error("Failed to insert history", err);
    }

    registerSession(hub.historyId, {
      close: () => {
        hub.cleanup("completed", "Ended remotely");
      },
      connectionId: params.quickSessionId || connection.id,
      userId: user.id,
    });

    const sshClient = new Client();
    hub.sshClient = sshClient;

    sshClient.on("ready", () => {
      if (mode === "tunnel") {
        hub.broadcastJson({ type: "ready", listenHost: getForwardListenHost() });
        return;
      }

      const cols = params.cols || 120;
      const rows = params.rows || 40;

      const handleStream = (err: Error | undefined, stream: import("ssh2").ClientChannel) => {
        if (err) {
          const errMsg = params.execCommand
            ? `Failed to execute command: ${err.message}`
            : `Failed to open shell: ${err.message}`;
          hub.broadcast(Buffer.from(`\r\n\x1b[31m${errMsg}\x1b[0m\r\n`));
          hub.cleanup("error", err.message);
          return;
        }

        hub.shellStream = stream;

        stream.on("data", (chunk: Buffer) => {
          hub.resetIdleTimer();
          hub.appendScrollback(chunk);
          hub.broadcast(chunk);
        });

        stream.on("close", () => {
          hub.cleanup("completed");
        });
      };

      if (params.execCommand) {
        sshClient.exec(
          params.execCommand,
          { pty: { term: "xterm-256color", cols, rows } },
          handleStream,
        );
      } else {
        sshClient.shell(
          { term: "xterm-256color", cols, rows },
          handleStream,
        );
      }
    });

    sshClient.on("error", (err) => {
      const msg = Buffer.from(`\r\n\x1b[31mSSH error: ${err.message}\x1b[0m\r\n`);
      if (mode === "tunnel") {
        hub.broadcastJson({ error: err.message });
      } else {
        hub.broadcast(msg);
      }
      hub.cleanup("error", err.message);
    });

    sshClient.on("close", () => {
      hub.cleanup("completed");
    });

    const connectConfig: Record<string, unknown> = {
      host: connection.hostname,
      port: connection.port || 22,
      username,
    };

    if (privateKey) {
      try {
        const normalized = normalizePrivateKeyForSsh2(privateKey);
        const parsedKey = require("ssh2").utils.parseKey(normalized, passphrase);
        if (!(parsedKey instanceof Error)) {
          connectConfig.privateKey = parsedKey;
          connectConfig.agent = new InMemoryVaultAgent([parsedKey]);
          connectConfig.agentForward = true;
        } else {
          connectConfig.privateKey = normalized;
          if (passphrase) connectConfig.passphrase = passphrase;
        }
      } catch {
        connectConfig.privateKey = normalizePrivateKeyForSsh2(privateKey);
        if (passphrase) connectConfig.passphrase = passphrase;
      }
    } else if (password) {
      connectConfig.password = password;
    }

    try {
      sshClient.connect(connectConfig);
    } catch (err) {
      const message = err instanceof Error ? err.message : "SSH connect failed";
      if (mode === "tunnel") {
        hub.broadcastJson({ error: message });
      } else {
        hub.broadcast(Buffer.from(`\r\n\x1b[31mSSH error: ${message}\x1b[0m\r\n`));
      }
      hub.cleanup("error", message);
    }
  }

  ws.on("message", onFirstMessage);

  ws.on("close", () => {
    // the socket will be removed by the hub if it's already attached
  });

  ws.on("error", () => {
    // the socket will be removed by the hub if it's already attached
  });
}
