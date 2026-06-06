import net from "node:net";

export function probeTcpPort(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

export async function waitForHostPort(
  host: string,
  port: number,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    onRetry?: () => Promise<void>;
    retryEveryMs?: number;
  },
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 180_000;
  const intervalMs = options?.intervalMs ?? 3_000;
  const retryEveryMs = options?.retryEveryMs ?? 20_000;
  const deadline = Date.now() + timeoutMs;
  let lastRetry = Date.now();

  while (Date.now() < deadline) {
    if (await probeTcpPort(host, port, Math.min(intervalMs, 5_000))) {
      return true;
    }

    if (options?.onRetry && Date.now() - lastRetry >= retryEveryMs) {
      await options.onRetry();
      lastRetry = Date.now();
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}
