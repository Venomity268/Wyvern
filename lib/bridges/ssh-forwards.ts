import net from "net";
import type { Client } from "ssh2";
import { v4 as uuidv4 } from "uuid";

export interface SshForward {
  id: string;
  server: net.Server;
  localPort: number;
  listenHost: string;
  remoteHost: string;
  remotePort: number;
}

export const FORWARD_BIND_LOCALHOST = "127.0.0.1";
export const FORWARD_BIND_ALL = "0.0.0.0";

export function resolveForwardListenHost(value?: string | null): string {
  if (value === FORWARD_BIND_ALL) return FORWARD_BIND_ALL;
  if (value === FORWARD_BIND_LOCALHOST) return FORWARD_BIND_LOCALHOST;
  const env = process.env.BASTION_FORWARD_HOST;
  if (env === FORWARD_BIND_ALL || env === FORWARD_BIND_LOCALHOST) return env;
  return FORWARD_BIND_LOCALHOST;
}

export function startSshForward(
  sshClient: Client,
  remoteHost: string,
  remotePort: number,
  preferredLocalPort?: number,
  listenHost?: string,
): Promise<SshForward> {
  const bindHost = resolveForwardListenHost(listenHost);
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      sshClient.forwardOut(
        socket.remoteAddress || "127.0.0.1",
        socket.remotePort || 0,
        remoteHost,
        remotePort,
        (err, stream) => {
          if (err) {
            socket.destroy();
            return;
          }
          stream.pipe(socket).pipe(stream);
        },
      );
    });

    server.on("error", reject);

    server.listen(preferredLocalPort || 0, bindHost, () => {
      const addr = server.address();
      const localPort =
        typeof addr === "object" && addr ? addr.port : preferredLocalPort || 0;
      resolve({
        id: uuidv4(),
        server,
        localPort,
        listenHost: bindHost,
        remoteHost,
        remotePort,
      });
    });
  });
}

export function stopSshForward(forward: SshForward): void {
  forward.server.close();
}

export function stopAllForwards(forwards: Map<string, SshForward>): void {
  for (const forward of forwards.values()) {
    stopSshForward(forward);
  }
  forwards.clear();
}

export function getForwardListenHost(): string {
  return resolveForwardListenHost();
}
