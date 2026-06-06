export type ConnectionProtocol = "ssh" | "vnc" | "rdp";

export type GuacProtocol = "vnc" | "rdp";

export const PROTOCOL_LABELS: Record<
  ConnectionProtocol,
  { label: string; hint: string }
> = {
  ssh: {
    label: "SSH",
    hint: "Terminal remote login — Ubuntu OpenSSH, Linux servers (port 22)",
  },
  vnc: {
    label: "VNC",
    hint: "Graphical desktop — Ubuntu VNC, TigerVNC, x11vnc (port 5900)",
  },
  rdp: {
    label: "RDP",
    hint: "Windows Remote Desktop, xrdp (port 3389 or 3390)",
  },
};

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
