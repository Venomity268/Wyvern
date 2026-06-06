export type ConnectionProtocol = "ssh" | "vnc" | "rdp";

export type GuacProtocol = "vnc" | "rdp";

export function isGuacProtocol(protocol: string): protocol is GuacProtocol {
  return protocol === "vnc" || protocol === "rdp";
}

export function defaultPort(protocol: ConnectionProtocol): number {
  switch (protocol) {
    case "ssh":
      return 22;
    case "rdp":
      return 3389;
    case "vnc":
      return 5900;
  }
}
