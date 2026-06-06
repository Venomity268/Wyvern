"use client";

import { wsUrl } from "@/lib/utils";
import type { ReadTextResult, SftpConnectParams, SftpEntry } from "./protocol";

type PendingHandler = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  chunks?: string[];
};

export class SftpClient {
  private ws: WebSocket | null = null;
  private ready = false;
  private cwd = "/";
  private pending = new Map<string, PendingHandler>();
  private queue: Record<string, unknown>[] = [];
  private connectParams: SftpConnectParams | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  get connected() {
    return this.ready && this.ws?.readyState === WebSocket.OPEN;
  }

  get currentPath() {
    return this.cwd;
  }

  private newId() {
    return crypto.randomUUID();
  }

  private send(payload: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("SFTP not connected");
    }
    this.ws.send(JSON.stringify(payload));
  }

  private request<T>(payload: Record<string, unknown>): Promise<T> {
    const id = this.newId();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      const msg = { ...payload, id };
      if (!this.ready) {
        this.queue.push(msg);
      } else {
        this.send(msg);
      }
    });
  }

  private flushQueue() {
    for (const msg of this.queue.splice(0)) {
      this.send(msg);
    }
  }

  private handleMessage = (event: MessageEvent) => {
    const data = event.data as string;
    if (!data.startsWith("{")) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.error && !msg.type) {
      const err = new Error(String(msg.error));
      for (const [, h] of this.pending) {
        h.reject(err);
      }
      this.pending.clear();
      return;
    }

    const id = String(msg.id || "");
    const handler = id ? this.pending.get(id) : undefined;

    if (msg.type === "get-chunk" && handler?.chunks) {
      handler.chunks.push(String(msg.data));
      return;
    }

    if (!handler) return;

    if (msg.type === "error") {
      this.pending.delete(id);
      const err = new Error(String(msg.error || "SFTP error"));
      (err as Error & { needsSudo?: boolean }).needsSudo = !!msg.needsSudo;
      handler.reject(err);
      return;
    }

    if (msg.type === "get-done" && handler.chunks) {
      this.pending.delete(id);
      const parts = handler.chunks.map((chunk) =>
        Uint8Array.from(atob(chunk), (c) => c.charCodeAt(0)),
      );
      const total = parts.reduce((sum, p) => sum + p.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const part of parts) {
        merged.set(part, offset);
        offset += part.length;
      }
      handler.resolve(merged);
      return;
    }

    if (
      msg.type === "get-chunk" ||
      msg.type === "put-ack" ||
      msg.type === "put-ready"
    ) {
      return;
    }

    this.pending.delete(id);
    handler.resolve(msg);
  };

  connect(params: SftpConnectParams): Promise<string> {
    this.disconnect();
    this.connectParams = params;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl("/api/sftp"));
      this.ws = ws;

      ws.onopen = () => {
        const init: Record<string, unknown> = {};
        if (params.quickSessionId) init.quickSessionId = params.quickSessionId;
        else if (params.connectionId) init.connectionId = params.connectionId;
        if (params.username) init.username = params.username;
        if (params.password) init.password = params.password;
        if (params.privateKey) init.privateKey = params.privateKey;
        ws.send(JSON.stringify(init));
      };

      ws.onmessage = (event) => {
        const data = event.data as string;
        if (!data.startsWith("{")) return;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(data);
        } catch {
          return;
        }

        if (msg.error && !msg.type) {
          const err = new Error(String(msg.error));
          (err as Error & { needsAuth?: boolean }).needsAuth = !!msg.needsAuth;
          reject(err);
          return;
        }

        if (msg.type === "ready") {
          this.ready = true;
          this.cwd = String(msg.cwd || "/");
          this.messageHandler = this.handleMessage;
          ws.onmessage = this.handleMessage;
          this.flushQueue();
          resolve(this.cwd);
          return;
        }

        this.handleMessage(event);
      };

      ws.onerror = () => reject(new Error("SFTP connection failed"));
      ws.onclose = () => {
        this.ready = false;
        for (const [, h] of this.pending) {
          h.reject(new Error("SFTP connection closed"));
        }
        this.pending.clear();
      };
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.close();
    }
    this.ws = null;
    this.ready = false;
    this.queue = [];
    this.pending.clear();
  }

  async list(path?: string): Promise<{ path: string; entries: SftpEntry[] }> {
    const res = await this.request<{ path: string; entries: SftpEntry[] }>({
      type: "list",
      path: path ?? this.cwd,
    });
    if (res.path) this.cwd = res.path;
    return res;
  }

  async realpath(path: string): Promise<string> {
    const res = await this.request<{ path: string }>({ type: "realpath", path });
    return res.path;
  }

  async readlink(path: string): Promise<string> {
    const res = await this.request<{ target: string }>({ type: "readlink", path });
    return res.target;
  }

  async readText(path: string): Promise<ReadTextResult> {
    const res = await this.request<ReadTextResult & { type: string }>({
      type: "read-text",
      path,
    });
    return {
      content: res.content,
      encoding: res.encoding,
      size: res.size,
      truncated: res.truncated,
      tooLarge: res.tooLarge,
    };
  }

  async writeText(path: string, content: string): Promise<void> {
    await this.request({ type: "write-text", path, content });
  }

  async download(path: string): Promise<Uint8Array> {
    const id = this.newId();
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as Uint8Array),
        reject,
        chunks: [],
      });
      this.send({ type: "get", path, id });
    });
  }

  async upload(path: string, data: Uint8Array): Promise<void> {
    const id = this.newId();
    await new Promise<void>((resolve, reject) => {
      const chunks: string[] = [];
      this.pending.set(id, {
        resolve: () => resolve(),
        reject,
        chunks,
      });

      const onMsg = (event: MessageEvent) => {
        const raw = event.data as string;
        if (!raw.startsWith("{")) return;
        try {
          const msg = JSON.parse(raw) as Record<string, unknown>;
          if (msg.id !== id) return;
          if (msg.type === "put-ready") {
            this.ws!.removeEventListener("message", onMsg);
            void (async () => {
              let b64 = "";
              const chunkSize = 0x8000;
              for (let i = 0; i < data.length; i += chunkSize) {
                b64 += String.fromCharCode(...data.subarray(i, i + chunkSize));
              }
              const encoded = btoa(b64);
              const sendSize = 48000;
              for (let i = 0; i < encoded.length; i += sendSize) {
                this.send({ type: "put-chunk", id, data: encoded.slice(i, i + sendSize) });
              }
              this.send({ type: "put-end", id });
            })();
          }
          if (msg.type === "put-done") {
            this.pending.delete(id);
            resolve();
          }
          if (msg.type === "error") {
            this.pending.delete(id);
            reject(new Error(String(msg.error)));
          }
        } catch {
          /* ignore */
        }
      };

      this.ws!.addEventListener("message", onMsg);
      this.send({ type: "put-start", path, id });
    });
  }

  async mkdir(path: string): Promise<void> {
    await this.request({ type: "mkdir", path });
  }

  async remove(path: string, isDirectory: boolean): Promise<void> {
    await this.request({ type: isDirectory ? "rmdir" : "rm", path });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.request({ type: "rename", oldPath, newPath });
  }

  async chmod(path: string, mode: string): Promise<void> {
    await this.request({ type: "chmod", path, mode });
  }

  async setSudoPassword(password: string): Promise<void> {
    await this.request({ type: "set-sudo-password", password });
  }

  async compress(cwd: string, names: string[], archiveName: string): Promise<void> {
    await this.request({ type: "compress", cwd, names, archiveName });
  }

  async extract(cwd: string, archivePath: string): Promise<void> {
    await this.request({ type: "extract", cwd, path: archivePath });
  }

  setCwd(path: string) {
    this.cwd = path;
  }
}

export function canAutoConnectSftp(
  hasStoredCredential: boolean,
  sessionAuth?: { username: string; password?: string; privateKey?: string } | null,
): boolean {
  if (hasStoredCredential) return true;
  return !!(sessionAuth?.username && (sessionAuth.password || sessionAuth.privateKey));
}
