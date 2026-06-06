import { WebSocket } from "ws";
import { Client } from "ssh2";
import { getDb } from "../db/index";
import { resolveSshConnection } from "./ssh-connect";
import { resolveQuickSsh } from "../quick-connect";
import { SessionUser } from "../auth/session-options";
import { v4 as uuidv4 } from "uuid";
import {
  getForwardListenHost,
  startSshForward,
  stopAllForwards,
  stopSshForward,
  type SshForward,
} from "./ssh-forwards";
import { registerSession, unregisterSession } from "../sessions/registry";
import { normalizePrivateKeyForSsh2 } from "../ssh/ssh-keys";

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

interface SshInitMessage {
  connectionId?: string;
  quickSessionId?: string;
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

export function handleSshConnection(ws: WebSocket, user: SessionUser) {
  let sshClient: Client | null = null;
  let historyId: string | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const forwards = new Map<string, SshForward>();
  let shellStream: import("ssh2").ClientChannel | null = null;
  let zmodemActive = false;

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      ws.close(4000, "Idle timeout");
    }, IDLE_TIMEOUT_MS);
  }

  function cleanup(status: string, errorMessage?: string) {
    if (idleTimer) clearTimeout(idleTimer);
    if (historyId) {
      unregisterSession(historyId);
      getDb()
        .prepare(
          "UPDATE connection_history SET ended_at = datetime('now'), status = ?, error_message = ? WHERE id = ?",
        )
        .run(status, errorMessage || null, historyId);
      historyId = null;
    }
    stopAllForwards(forwards);
    shellStream?.end();
    shellStream = null;
    sshClient?.end();
    sshClient = null;
  }

  async function handleForwardAdd(msg: ForwardAddMessage) {
    if (!sshClient) return;
    const requestId = msg.id || uuidv4();
    try {
      const forward = await startSshForward(
        sshClient,
        msg.remoteHost,
        msg.remotePort,
        msg.localPort,
      );
      forwards.set(forward.id, forward);
      sendJson(ws, {
        type: "forward-ready",
        id: forward.id,
        requestId,
        localPort: forward.localPort,
        listenHost: getForwardListenHost(),
        remoteHost: forward.remoteHost,
        remotePort: forward.remotePort,
      });
    } catch (err) {
      sendJson(ws, {
        type: "forward-error",
        id: requestId,
        error: err instanceof Error ? err.message : "Forward failed",
      });
    }
  }

  function handleForwardRemove(msg: ForwardRemoveMessage) {
    const forward = forwards.get(msg.id);
    if (!forward) return;
    stopSshForward(forward);
    forwards.delete(msg.id);
    sendJson(ws, { type: "forward-removed", id: msg.id });
  }

  function handleControlMessage(input: string) {
    resetIdleTimer();
    try {
      const parsed = JSON.parse(input) as Record<string, unknown>;
      if (parsed.type === "forward-add") {
        void handleForwardAdd(parsed as unknown as ForwardAddMessage);
        return true;
      }
      if (parsed.type === "forward-remove") {
        handleForwardRemove(parsed as unknown as ForwardRemoveMessage);
        return true;
      }
      if (parsed.type === "resize" && shellStream && parsed.cols && parsed.rows) {
        shellStream.setWindow(
          Number(parsed.rows),
          Number(parsed.cols),
          0,
          0,
        );
        return true;
      }
      if (parsed.type === "zmodem-start") {
        zmodemActive = true;
        return true;
      }
      if (parsed.type === "zmodem-end") {
        zmodemActive = false;
        return true;
      }
    } catch {
      /* not JSON control message */
    }
    return false;
  }

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
      cleanup("error", resolved.error);
      return;
    }

    const connection = resolved.connection;
    const username = resolved.username;
    const password = resolved.password;
    const privateKey = resolved.privateKey;
    const passphrase = resolved.passphrase;

    historyId = uuidv4();
    const isQuick = !!params.quickSessionId;
    getDb()
      .prepare(
        `INSERT INTO connection_history
          (id, user_id, connection_id, quick_session_id, workspace_id, protocol, connection_name, hostname, status)
         VALUES (?, ?, ?, ?, ?, 'ssh', ?, ?, 'active')`,
      )
      .run(
        historyId,
        user.id,
        isQuick ? null : connection.id,
        isQuick ? params.quickSessionId : null,
        isQuick ? null : connection.workspace_id || null,
        connection.name,
        connection.hostname,
      );

    registerSession(historyId, {
      close: () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, "Session ended");
        } else {
          cleanup("completed", "Ended remotely");
        }
      },
      connectionId: params.quickSessionId || connection.id,
      userId: user.id,
    });

    sshClient = new Client();
    resetIdleTimer();

    sshClient.on("ready", () => {
      if (mode === "tunnel") {
        sendJson(ws, { type: "ready", listenHost: getForwardListenHost() });

        ws.on("message", (msg: Buffer | string) => {
          const input = typeof msg === "string" ? msg : msg.toString("utf-8");
          handleControlMessage(input);
        });

        ws.on("close", () => {
          cleanup("completed");
        });
        return;
      }

      const cols = params.cols || 120;
      const rows = params.rows || 40;

      const handleStream = (err: Error | undefined, stream: import("ssh2").ClientChannel) => {
        if (err) {
          const errMsg = params.execCommand
            ? `Failed to execute command: ${err.message}`
            : `Failed to open shell: ${err.message}`;
          ws.send(`\r\n\x1b[31m${errMsg}\x1b[0m\r\n`);
          ws.close();
          cleanup("error", err.message);
          return;
        }

        shellStream = stream;

        stream.on("data", (chunk: Buffer) => {
          resetIdleTimer();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk, { binary: true });
          }
        });

        stream.on("close", () => {
          if (ws.readyState === WebSocket.OPEN) ws.close();
          cleanup("completed");
        });

        ws.on("message", (msg: Buffer | string | ArrayBuffer) => {
          if (msg instanceof ArrayBuffer || Buffer.isBuffer(msg)) {
            const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);
            if (zmodemActive && shellStream) {
              resetIdleTimer();
              shellStream.write(buf);
              return;
            }
          }

          const input =
            typeof msg === "string"
              ? msg
              : Buffer.isBuffer(msg)
                ? msg.toString("utf-8")
                : Buffer.from(msg as ArrayBuffer).toString("utf-8");
          if (handleControlMessage(input)) return;

          resetIdleTimer();
          try {
            stream.write(input);
          } catch {
            /* stream closed */
          }
        });

        ws.on("close", () => {
          stream.end();
          cleanup("completed");
        });
      };

      if (params.execCommand) {
        sshClient!.exec(
          params.execCommand,
          { pty: { term: "xterm-256color", cols, rows } },
          handleStream,
        );
      } else {
        sshClient!.shell(
          { term: "xterm-256color", cols, rows },
          handleStream,
        );
      }
    });

    sshClient.on("error", (err) => {
      const msg = `\r\n\x1b[31mSSH error: ${err.message}\x1b[0m\r\n`;
      if (ws.readyState === WebSocket.OPEN) {
        if (mode === "tunnel") {
          sendJson(ws, { error: err.message });
        } else {
          ws.send(msg);
        }
        ws.close();
      }
      cleanup("error", err.message);
    });

    sshClient.on("close", () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    });

    const connectConfig: Record<string, unknown> = {
      host: connection.hostname,
      port: connection.port || 22,
      username,
    };

    if (privateKey) {
      connectConfig.privateKey = normalizePrivateKeyForSsh2(privateKey);
      if (passphrase) connectConfig.passphrase = passphrase;
    } else if (password) {
      connectConfig.password = password;
    }

    try {
      sshClient.connect(connectConfig);
    } catch (err) {
      const message = err instanceof Error ? err.message : "SSH connect failed";
      if (ws.readyState === WebSocket.OPEN) {
        if (mode === "tunnel") {
          sendJson(ws, { error: message });
        } else {
          ws.send(`\r\n\x1b[31mSSH error: ${message}\x1b[0m\r\n`);
        }
        ws.close();
      }
      cleanup("error", message);
    }
  }

  ws.on("message", onFirstMessage);

  ws.on("close", () => {
    cleanup("completed");
  });

  ws.on("error", () => {
    cleanup("error", "WebSocket error");
  });
}
