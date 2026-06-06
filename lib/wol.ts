import dgram from "node:dgram";
import { isIPv4 } from "node:net";

const MAC_PATTERN = /^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/;

export function normalizeMacAddress(mac: string): string | null {
  const trimmed = mac.trim();
  if (!trimmed) return null;

  if (MAC_PATTERN.test(trimmed)) {
    return trimmed.replace(/-/g, ":").toLowerCase();
  }

  const hex = trimmed.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length !== 12) return null;

  return hex
    .match(/.{2}/g)!
    .join(":")
    .toLowerCase();
}

export function isValidMacAddress(mac: string): boolean {
  return normalizeMacAddress(mac) !== null;
}

export function broadcastTargetsForHost(hostname: string, customBroadcast?: string | null): string[] {
  const targets = new Set<string>();

  if (customBroadcast?.trim()) {
    targets.add(customBroadcast.trim());
  }

  targets.add("255.255.255.255");

  if (isIPv4(hostname)) {
    const parts = hostname.split(".").map(Number);
    if (parts.length === 4 && parts.every((p) => p >= 0 && p <= 255)) {
      targets.add(`${parts[0]}.${parts[1]}.${parts[2]}.255`);
    }
  }

  return [...targets];
}

export function sendWakeOnLan(
  mac: string,
  broadcast = "255.255.255.255",
  port = 9,
): Promise<void> {
  const normalized = normalizeMacAddress(mac);
  if (!normalized) {
    return Promise.reject(new Error("Invalid MAC address"));
  }

  const macBytes = Buffer.from(normalized.replace(/:/g, ""), "hex");
  const packet = Buffer.alloc(6 + 16 * 6, 0xff);
  for (let i = 0; i < 16; i++) {
    macBytes.copy(packet, 6 + i * 6);
  }

  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    const cleanup = (err?: Error) => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve();
    };

    socket.once("error", (err) => cleanup(err));

    socket.bind({ port: 0, address: "0.0.0.0" }, () => {
      try {
        socket.setBroadcast(true);
      } catch (err) {
        cleanup(err instanceof Error ? err : new Error("Failed to enable broadcast"));
        return;
      }

      socket.send(packet, port, broadcast, (err) => cleanup(err ?? undefined));
    });
  });
}

const WOL_PORTS = [9, 7];

export async function sendWakeOnLanBurst(mac: string, broadcasts: string[]): Promise<void> {
  const targets = broadcasts.length ? broadcasts : ["255.255.255.255"];
  let sent = false;
  let lastError: Error | undefined;

  for (let round = 0; round < 3; round++) {
    for (const broadcast of targets) {
      for (const port of WOL_PORTS) {
        try {
          await sendWakeOnLan(mac, broadcast, port);
          sent = true;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error("Wake packet failed");
        }
      }
    }
    if (round < 2) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  if (!sent && lastError) {
    throw lastError;
  }
}
