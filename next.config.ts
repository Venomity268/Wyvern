import type { NextConfig } from "next";
import { execFileSync } from "child_process";

function extraDevOrigins(): string[] {
  const origins: string[] = [];

  const fromEnv = process.env.BASTION_DEV_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (fromEnv?.length) {
    origins.push(...fromEnv);
  }

  try {
    const tailscaleIp = execFileSync("tailscale", ["ip", "-4"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (tailscaleIp) {
      origins.push(tailscaleIp);
    }
  } catch {
    // Tailscale not installed or not connected
  }

  return origins;
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "ssh2"],
  transpilePackages: ["@wterm/dom", "@wterm/react", "@wterm/ghostty"],
  allowedDevOrigins: [
    "wyvern.cain",
    "*.cain",
    "wyvern.localhost",
    "*.localhost",
    "192.*.*.*",
    // Tailscale CGNAT (100.64.0.0/10) when accessing via http://100.x.x.x:port
    "100.*.*.*",
    ...extraDevOrigins(),
  ],
};

export default nextConfig;
