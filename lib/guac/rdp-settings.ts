import { APP_SLUG } from "@/lib/brand";

/** Shared Guacamole RDP settings (Windows, xrdp, etc.). */

export function guacRdpConnectionSettings(
  displayWidth: number,
  displayHeight: number,
  opts: {
    hostname: string;
    port: string | number;
    username: string;
    password: string;
  },
): Record<string, string | number | boolean> {
  return {
    hostname: opts.hostname,
    port: String(opts.port),
    username: opts.username,
    password: opts.password,
    width: displayWidth,
    height: displayHeight,
    dpi: 96,
    "color-depth": 32,
    "resize-method": "display-update",
    security: "any",
    "ignore-cert": true,
    "client-name": APP_SLUG,
    "enable-wallpaper": false,
    "enable-font-smoothing": true,
    "enable-mouse-hover": true,
    "disable-copy": false,
    "disable-paste": false,
    "enable-printing": false,
  };
}
