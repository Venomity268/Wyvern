import "./lib/env";
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import GuacamoleLite from "guacamole-lite";
import { getDb } from "./lib/db/index";
import { getSessionUserFromRequest } from "./lib/auth/session-request";
import { handleSshConnection } from "./lib/bridges/ssh-bridge";
import { handleSftpConnection } from "./lib/bridges/sftp-bridge";
import { handleGuacOpen, handleGuacClose } from "./lib/bridges/guac-history";
import { getGuacdOptions, getGuacClientOptions } from "./lib/guac/config";

const dev = process.env.NODE_ENV !== "production";
// BASTION_BIND wins over HOST so portless can set HOST=127.0.0.1 without blocking LAN bind.
const hostname = process.env.BASTION_BIND ?? process.env.HOST ?? "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

getDb();

const app = next({ dev, hostname, port, turbopack: dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url || "/", true);
    handle(req, res, parsedUrl);
  });

  const guacClientOptions = getGuacClientOptions();
  const guacKey = guacClientOptions.crypt.key;
  const guacKeyBytes = Buffer.isBuffer(guacKey)
    ? guacKey.length
    : Buffer.byteLength(String(guacKey));
  if (guacKeyBytes !== 32) {
    throw new Error(
      `Guacamole encryption key must be 32 bytes (got ${guacKeyBytes}). Check GUAC_TOKEN_SECRET and restart the server.`,
    );
  }

  const guacServer = new GuacamoleLite(
    { server, path: "/api/guac" },
    getGuacdOptions(),
    guacClientOptions,
  );

  // guacamole-lite rejects non-/api/guac upgrades with 400; route upgrades ourselves
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (guacServer.webSocketServer as any)._removeListeners?.();

  guacServer.on("open", (clientConnection: unknown) => {
    handleGuacOpen(clientConnection as Parameters<typeof handleGuacOpen>[0]);
  });

  guacServer.on("close", (clientConnection: unknown, error?: Error) => {
    handleGuacClose(
      clientConnection as Parameters<typeof handleGuacClose>[0],
      error,
    );
  });

  const sshWss = new WebSocketServer({ noServer: true });
  const sftpWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const { pathname } = parse(req.url || "/", true);

    if (pathname === "/api/ssh") {
      let user;
      try {
        user = await getSessionUserFromRequest(req);
      } catch {
        user = null;
      }
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      sshWss.handleUpgrade(req, socket, head, (ws) => {
        handleSshConnection(ws, user);
      });
    } else if (pathname === "/api/sftp") {
      let user;
      try {
        user = await getSessionUserFromRequest(req);
      } catch {
        user = null;
      }
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      sftpWss.handleUpgrade(req, socket, head, (ws) => {
        handleSftpConnection(ws, user);
      });
    } else if (pathname === "/api/guac") {
      guacServer.webSocketServer.handleUpgrade(req, socket, head, (ws) => {
        guacServer.webSocketServer.emit("connection", ws, req);
      });
    } else {
      app.getUpgradeHandler()(req, socket, head);
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> Wyvern ready on http://${hostname}:${port}`);
    console.log(`> guacd at ${getGuacdOptions().host}:${getGuacdOptions().port}`);
  });
});
