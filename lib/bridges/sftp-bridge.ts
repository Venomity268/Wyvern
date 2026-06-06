import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import type { Client, SFTPWrapper } from "ssh2";
import { SessionUser } from "../auth/session-options";
import { connectSshClient, resolveSshConnection } from "./ssh-connect";
import { resolveQuickSsh } from "../quick-connect";
import {
  SFTP_MAX_EDIT_BYTES,
  isPermissionError,
} from "../sftp/protocol";
import {
  execWithOptionalSudo,
  sudoChmod,
  sudoMkdir,
  sudoRename,
  sudoRm,
  sudoWriteText,
  compressPaths,
  extractArchive,
  shellQuote,
} from "./sftp-sudo";

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

interface SftpInitMessage {
  connectionId?: string;
  quickSessionId?: string;
  password?: string;
  privateKey?: string;
  username?: string;
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function mapEntry(e: { filename: string; longname: string; attrs: { size: number; mode: number; mtime?: number } }) {
  const mode = e.attrs.mode;
  const isSymlink = (mode & 0o120000) === 0o120000;
  const isDirectory = (mode & 0o40000) === 0o40000;
  return {
    filename: e.filename,
    longname: e.longname,
    attrs: {
      size: e.attrs.size,
      mode,
      isDirectory,
      isSymlink,
      mtime: e.attrs.mtime,
    },
  };
}

function readFileBuffer(
  sftpSession: SFTPWrapper,
  remotePath: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let truncated = false;
    const stream = sftpSession.createReadStream(remotePath);
    stream.on("data", (chunk: Buffer) => {
      if (truncated) return;
      total += chunk.length;
      if (total > maxBytes) {
        truncated = true;
        stream.destroy();
        resolve({ buffer: Buffer.concat(chunks).subarray(0, maxBytes), truncated: true });
        return;
      }
      chunks.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      resolve({ buffer: Buffer.concat(chunks), truncated });
    });
  });
}

function isDisplayableText(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  let printable = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) printable++;
  }
  return sample.length === 0 || printable / sample.length > 0.85;
}

export function handleSftpConnection(ws: WebSocket, user: SessionUser) {
  let sshClient: Client | null = null;
  let sftp: SFTPWrapper | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let sudoPassword: string | null = null;
  let cwd = "/";
  const pendingPuts = new Map<string, import("stream").Writable>();
  const pendingRequests: Record<string, unknown>[] = [];

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => ws.close(4000, "Idle timeout"), IDLE_TIMEOUT_MS);
  }

  function cleanup() {
    if (idleTimer) clearTimeout(idleTimer);
    sftp?.end();
    sftp = null;
    sshClient?.end();
    sshClient = null;
    sudoPassword = null;
  }

  function permissionResponse(id: string, err: Error) {
    if (isPermissionError(err.message)) {
      sendJson(ws, { type: "error", id, error: err.message, needsSudo: true });
    } else {
      sendJson(ws, { type: "error", id, error: err.message });
    }
  }

  async function handleRequest(req: Record<string, unknown>) {
    if (!sftp || !sshClient) {
      pendingRequests.push(req);
      return;
    }
    const id = String(req.id || uuidv4());

    try {
      switch (req.type) {
        case "set-sudo-password": {
          sudoPassword = String(req.password || "");
          sendJson(ws, { type: "ok", id });
          break;
        }
        case "list": {
          const path = String(req.path || cwd);
          sftp.readdir(path, (err, list) => {
            if (err) {
              permissionResponse(id, err);
              return;
            }
            sendJson(ws, {
              type: "list-result",
              id,
              path,
              entries: list.map(mapEntry),
            });
          });
          break;
        }
        case "stat": {
          const path = String(req.path || "");
          sftp.stat(path, (err, stats) => {
            if (err) {
              permissionResponse(id, err);
              return;
            }
            sendJson(ws, {
              type: "stat-result",
              id,
              attrs: {
                size: stats.size,
                mode: stats.mode,
                isDirectory: stats.isDirectory(),
                isSymlink: stats.isSymbolicLink(),
                mtime: stats.mtime,
              },
            });
          });
          break;
        }
        case "realpath": {
          const path = String(req.path || ".");
          sftp.realpath(path, (err, absPath) => {
            if (err) {
              permissionResponse(id, err);
              return;
            }
            sendJson(ws, { type: "realpath-result", id, path: absPath });
          });
          break;
        }
        case "readlink": {
          const path = String(req.path || "");
          sftp.readlink(path, (err, target) => {
            if (err) {
              permissionResponse(id, err);
              return;
            }
            sendJson(ws, { type: "readlink-result", id, target });
          });
          break;
        }
        case "read-text": {
          const remotePath = String(req.path || "");
          try {
            const { buffer, truncated } = await readFileBuffer(
              sftp,
              remotePath,
              SFTP_MAX_EDIT_BYTES + 1,
            );
            if (buffer.length > SFTP_MAX_EDIT_BYTES) {
              sendJson(ws, {
                type: "read-text-result",
                id,
                tooLarge: true,
                size: buffer.length,
                content: "",
                encoding: "utf8",
              });
              break;
            }
            const asText = isDisplayableText(buffer);
            sendJson(ws, {
              type: "read-text-result",
              id,
              content: asText
                ? buffer.toString("utf8")
                : buffer.toString("base64"),
              encoding: asText ? "utf8" : "base64",
              size: buffer.length,
              truncated,
            });
          } catch (err) {
            permissionResponse(id, err instanceof Error ? err : new Error("Read failed"));
          }
          break;
        }
        case "write-text": {
          const remotePath = String(req.path || "");
          const content = String(req.content ?? "");
          const tmpPath = `${remotePath}.wterm-tmp-${Date.now()}`;
          try {
            await new Promise<void>((resolve, reject) => {
              const wsStream = sftp!.createWriteStream(tmpPath);
              wsStream.on("error", reject);
              wsStream.on("close", () => resolve());
              wsStream.end(Buffer.from(content, "utf8"));
            });
            await new Promise<void>((resolve, reject) => {
              sftp!.rename(tmpPath, remotePath, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            sendJson(ws, { type: "write-text-done", id });
          } catch (err) {
            const e = err instanceof Error ? err : new Error("Write failed");
            if (isPermissionError(e.message) && sudoPassword) {
              try {
                await sudoWriteText(sshClient, remotePath, content, sudoPassword);
                sendJson(ws, { type: "write-text-done", id });
              } catch (sudoErr) {
                permissionResponse(
                  id,
                  sudoErr instanceof Error ? sudoErr : new Error("Write failed"),
                );
              }
            } else {
              permissionResponse(id, e);
            }
          }
          break;
        }
        case "get": {
          const remotePath = String(req.path || "");
          const readStream = sftp.createReadStream(remotePath);
          readStream.on("data", (chunk: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "get-chunk", id, data: chunk.toString("base64") }));
            }
          });
          readStream.on("error", (err: Error) => {
            permissionResponse(id, err);
          });
          readStream.on("end", () => {
            sendJson(ws, { type: "get-done", id });
          });
          break;
        }
        case "put-start": {
          const remotePath = String(req.path || "");
          const writeStream = sftp.createWriteStream(remotePath);
          const putId = id;
          pendingPuts.set(putId, writeStream);
          writeStream.on("error", (err: Error) => {
            pendingPuts.delete(putId);
            permissionResponse(putId, err);
          });
          writeStream.on("close", () => {
            pendingPuts.delete(putId);
            sendJson(ws, { type: "put-done", id: putId });
          });
          sendJson(ws, { type: "put-ready", id: putId });
          break;
        }
        case "put-chunk": {
          const putId = String(req.id || "");
          const stream = pendingPuts.get(putId);
          if (!stream) {
            sendJson(ws, { type: "error", id: putId, error: "No active upload" });
            return;
          }
          const chunk = Buffer.from(String(req.data || ""), "base64");
          stream.write(chunk);
          sendJson(ws, { type: "put-ack", id: putId });
          break;
        }
        case "put-end": {
          const putId = String(req.id || "");
          const stream = pendingPuts.get(putId);
          if (stream) {
            stream.end();
            pendingPuts.delete(putId);
          }
          break;
        }
        case "mkdir": {
          const path = String(req.path || "");
          sftp.mkdir(path, (err) => {
            if (err) {
              if (isPermissionError(err.message) && sudoPassword) {
                void sudoMkdir(sshClient!, path, sudoPassword)
                  .then(() => sendJson(ws, { type: "ok", id }))
                  .catch((e) => permissionResponse(id, e));
              } else {
                permissionResponse(id, err);
              }
              return;
            }
            sendJson(ws, { type: "ok", id });
          });
          break;
        }
        case "rm": {
          const path = String(req.path || "");
          sftp.unlink(path, (err) => {
            if (err) {
              if (isPermissionError(err.message) && sudoPassword) {
                void sudoRm(sshClient!, path, false, sudoPassword)
                  .then(() => sendJson(ws, { type: "ok", id }))
                  .catch((e) => permissionResponse(id, e));
              } else {
                permissionResponse(id, err);
              }
              return;
            }
            sendJson(ws, { type: "ok", id });
          });
          break;
        }
        case "rmdir": {
          const path = String(req.path || "");
          sftp.rmdir(path, (err) => {
            if (err) {
              if (isPermissionError(err.message) && sudoPassword) {
                void sudoRm(sshClient!, path, true, sudoPassword)
                  .then(() => sendJson(ws, { type: "ok", id }))
                  .catch((e) => permissionResponse(id, e));
              } else {
                permissionResponse(id, err);
              }
              return;
            }
            sendJson(ws, { type: "ok", id });
          });
          break;
        }
        case "rename": {
          const oldPath = String(req.oldPath || "");
          const newPath = String(req.newPath || "");
          sftp.rename(oldPath, newPath, (err) => {
            if (err) {
              if (isPermissionError(err.message) && sudoPassword) {
                void sudoRename(sshClient!, oldPath, newPath, sudoPassword)
                  .then(() => sendJson(ws, { type: "ok", id }))
                  .catch((e) => permissionResponse(id, e));
              } else {
                permissionResponse(id, err);
              }
              return;
            }
            sendJson(ws, { type: "ok", id });
          });
          break;
        }
        case "chmod": {
          const path = String(req.path || "");
          const mode = parseInt(String(req.mode || "644"), 8);
          sftp.chmod(path, mode, (err) => {
            if (err) {
              if (isPermissionError(err.message) && sudoPassword) {
                void sudoChmod(sshClient!, path, String(req.mode || "644"), sudoPassword)
                  .then(() => sendJson(ws, { type: "ok", id }))
                  .catch((e) => permissionResponse(id, e));
              } else {
                permissionResponse(id, err);
              }
              return;
            }
            sendJson(ws, { type: "ok", id });
          });
          break;
        }
        case "exec": {
          const command = String(req.command || "");
          try {
            const result = await execWithOptionalSudo(sshClient, command, sudoPassword);
            sendJson(ws, {
              type: "exec-result",
              id,
              stdout: result.stdout,
              stderr: result.stderr,
              code: result.code,
            });
          } catch (err) {
            permissionResponse(id, err instanceof Error ? err : new Error("Exec failed"));
          }
          break;
        }
        case "compress": {
          const dir = String(req.cwd || cwd);
          const names = (req.names as string[]) || [];
          const archiveName = String(req.archiveName || "archive.tar.gz");
          try {
            await compressPaths(sshClient, dir, names, archiveName, sudoPassword);
            sendJson(ws, { type: "ok", id });
          } catch (err) {
            permissionResponse(id, err instanceof Error ? err : new Error("Compress failed"));
          }
          break;
        }
        case "extract": {
          const dir = String(req.cwd || cwd);
          const archivePath = String(req.path || "");
          try {
            await extractArchive(sshClient, dir, archivePath, sudoPassword);
            sendJson(ws, { type: "ok", id });
          } catch (err) {
            permissionResponse(id, err instanceof Error ? err : new Error("Extract failed"));
          }
          break;
        }
        default:
          sendJson(ws, { type: "error", id, error: `Unknown request: ${req.type}` });
      }
    } catch (err) {
      sendJson(ws, {
        type: "error",
        id,
        error: err instanceof Error ? err.message : "Request failed",
      });
    }
  }

  function onFirstMessage(data: Buffer | string) {
    ws.off("message", onFirstMessage);

    const text = typeof data === "string" ? data : data.toString("utf-8");
    let params: SftpInitMessage;
    try {
      params = JSON.parse(text);
    } catch {
      sendJson(ws, { error: "Invalid connection parameters" });
      ws.close();
      return;
    }

    const connectionId =
      typeof params.connectionId === "string" ? params.connectionId.trim() : "";
    const quickSessionId =
      typeof params.quickSessionId === "string" ? params.quickSessionId.trim() : "";

    if (!connectionId && !quickSessionId) {
      sendJson(ws, { error: "Connection id required", needsAuth: true });
      setTimeout(() => ws.close(), 500);
      return;
    }

    const resolved = quickSessionId
      ? resolveQuickSsh(user, quickSessionId, {
          username: params.username,
          password: params.password,
          privateKey: params.privateKey,
        })
      : resolveSshConnection(user, connectionId, {
          username: params.username,
          password: params.password,
          privateKey: params.privateKey,
        });

    if ("error" in resolved) {
      sendJson(ws, { error: resolved.error, needsAuth: resolved.needsAuth });
      setTimeout(() => ws.close(), 500);
      return;
    }

    resetIdleTimer();

    sshClient = connectSshClient(
      resolved,
      (client) => {
        client.sftp((err, sftpSession) => {
          if (err) {
            sendJson(ws, { error: err.message });
            ws.close();
            cleanup();
            return;
          }
          sftp = sftpSession;

          sftp.realpath(".", (rpErr, absPath) => {
            cwd = rpErr ? "/" : absPath;
            sendJson(ws, { type: "ready", cwd });

            ws.on("message", (msg: Buffer | string) => {
              resetIdleTimer();
              const input = typeof msg === "string" ? msg : msg.toString("utf-8");
              if (!input.startsWith("{")) return;
              try {
                const req = JSON.parse(input) as Record<string, unknown>;
                void handleRequest(req);
              } catch {
                /* ignore */
              }
            });

            for (const req of pendingRequests.splice(0)) {
              void handleRequest(req);
            }
          });
        });
      },
      (err) => {
        sendJson(ws, { error: err.message });
        ws.close();
        cleanup();
      },
    );
  }

  ws.on("message", onFirstMessage);
  ws.on("close", cleanup);
  ws.on("error", cleanup);
}
