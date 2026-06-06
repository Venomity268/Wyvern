import net from "net";
import type { Client } from "ssh2";
import { v4 as uuidv4 } from "uuid";

export interface SshForward {
  id: string;
  server: net.Server;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export function startSshForward(
  sshClient: Client,
  remoteHost: string,
  remotePort: number,
  preferredLocalPort?: number,
): Promise<SshForward> {
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

    server.listen(preferredLocalPort || 0, "127.0.0.1", () => {
      const addr = server.address();
      const localPort =
        typeof addr === "object" && addr ? addr.port : preferredLocalPort || 0;
      resolve({
        id: uuidv4(),
        server,
        localPort,
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
  return process.env.BASTION_FORWARD_HOST || "127.0.0.1";
}
