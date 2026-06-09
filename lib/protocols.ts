export type ConnectionProtocol = "ssh" | "telnet" | "vnc" | "rdp";

export type GuacProtocol = "vnc" | "rdp";

export const PROTOCOL_LABELS: Record<
  ConnectionProtocol,
  { label: string; hint: string }
> = {
  ssh: {
    label: "SSH",
    hint: "Terminal remote login — Ubuntu OpenSSH, Linux servers (port 22)",
  },
  telnet: {
    label: "Telnet",
    hint: "Unencrypted terminal — network equipment, legacy systems (port 23)",
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

export function isTerminalProtocol(protocol: string): protocol is "ssh" | "telnet" {
  return protocol === "ssh" || protocol === "telnet";
}

export function defaultPort(protocol: ConnectionProtocol): number {
  switch (protocol) {
    case "ssh":
      return 22;
    case "telnet":
      return 23;
    case "rdp":
      return 3389;
    case "vnc":
      return 5900;
  }
}
