import { guacDisplaySettings } from "./display-settings";

/** Guacamole VNC settings (macOS Screen Sharing, TigerVNC, etc.). */
export function guacVncConnectionSettings(
  displayWidth: number,
  displayHeight: number,
  opts: {
    hostname: string;
    port: string | number;
    password: string;
    username?: string;
  },
): Record<string, string | number | boolean> {
  const settings: Record<string, string | number | boolean> = {
    hostname: opts.hostname,
    port: String(opts.port),
    password: opts.password,
    autoretry: 3,
    "clipboard-encoding": "UTF-8",
    ...guacDisplaySettings(displayWidth, displayHeight),
  };
  if (opts.username) {
    settings.username = opts.username;
  }
  return settings;
}
