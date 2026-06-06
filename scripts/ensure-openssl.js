/**
 * Ensures OpenSSL is available for portless (HTTPS/WSS local dev).
 * On Windows, prepends Git for Windows or OpenSSL install paths to PATH.
 * Syncs the portless hostname into the hosts file when using a custom TLD.
 */
const { spawnSync, execFileSync } = require("child_process");
const dns = require("dns").promises;
const fs = require("fs");
const path = require("path");

const PORTLESS_CLI = path.join(__dirname, "..", "node_modules", "portless", "dist", "cli.js");
const PORTLESS_APP = "wterm-bastion";
const PORTLESS_TLD = "cain";
const HOSTS_PATH =
  process.platform === "win32"
    ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts")
    : "/etc/hosts";
const MARKER_START = "# portless-start";
const MARKER_END = "# portless-end";

const WIN_OPENSSL_BIN = [
  path.join("C:", "Program Files", "Git", "usr", "bin", "openssl.exe"),
  path.join("C:", "Program Files", "OpenSSL-Win64", "bin", "openssl.exe"),
  path.join("C:", "Program Files (x86)", "OpenSSL-Win32", "bin", "openssl.exe"),
  path.join("C:", "Program Files", "OpenSSL", "bin", "openssl.exe"),
];

const WIN_OPENSSL_CONF = [
  path.join("C:", "Program Files", "Git", "mingw64", "etc", "ssl", "openssl.cnf"),
  path.join("C:", "Program Files", "Git", "usr", "ssl", "openssl.cnf"),
  path.join("C:", "Program Files", "OpenSSL-Win64", "bin", "openssl.cnf"),
  path.join("C:", "Program Files", "OpenSSL-Win64", "openssl.cnf"),
  path.join("C:", "Program Files (x86)", "OpenSSL-Win32", "bin", "openssl.cnf"),
  path.join("C:", "Program Files", "OpenSSL", "bin", "cnf", "openssl.cnf"),
];

function portlessHostname(tld = PORTLESS_TLD) {
  return `${PORTLESS_APP}.${tld}`;
}

function tryOpenssl(env) {
  try {
    execFileSync("openssl", ["version"], { stdio: "pipe", env });
    return true;
  } catch {
    return false;
  }
}

function buildEnv() {
  const env = { ...process.env };

  if (tryOpenssl(env)) {
    return env;
  }

  if (process.platform === "win32") {
    // Windows environment variables are case-insensitive, but copying process.env
    // to a plain object makes it case-sensitive. Locate the active Path key.
    const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") || "Path";
    const originalPath = env[pathKey] || "";

    for (const bin of WIN_OPENSSL_BIN) {
      if (!fs.existsSync(bin)) continue;
      const dir = path.dirname(bin);
      env[pathKey] = `${dir};${originalPath}`;

      // Clean up other case variations to prevent child processes from receiving
      // duplicate conflicting keys which can break command resolution (e.g. certutil).
      for (const k of Object.keys(env)) {
        if (k.toUpperCase() === "PATH" && k !== pathKey) {
          delete env[k];
        }
      }

      if (!env.OPENSSL_CONF) {
        for (const conf of WIN_OPENSSL_CONF) {
          if (fs.existsSync(conf)) {
            env.OPENSSL_CONF = conf;
            break;
          }
        }
      }
      if (tryOpenssl(env)) {
        console.log(`> Using OpenSSL at ${bin}`);
        return env;
      }
    }
  }

  const hostname = portlessHostname();
  console.error(`
OpenSSL is required for portless (https://${hostname}).

Install OpenSSL, then re-run:

  Windows (recommended):
    winget install -e --id ShiningLight.OpenSSL.Dev

  Or install Git for Windows (includes OpenSSL):
    winget install -e --id Git.Git

After installing, open a new terminal and run:
  npm run setup:portless
  npm run start:dev
`);
  process.exit(1);
}

function applyPortlessDefaults(env) {
  const lanDisabled = env.PORTLESS_LAN === "0" || env.PORTLESS_LAN === "false";

  if (!lanDisabled && env.PORTLESS_LAN === undefined) {
    env.PORTLESS_LAN = process.platform === "win32" ? "0" : "1";
  }
  if (env.PORTLESS_TLD === undefined) {
    env.PORTLESS_TLD = PORTLESS_TLD;
  }
  if (env.BASTION_BIND === undefined) {
    env.BASTION_BIND = "0.0.0.0";
  }
  env.PORTLESS_TAILSCALE = "0";
}

function readHostsFile() {
  try {
    return fs.readFileSync(HOSTS_PATH, "utf-8");
  } catch {
    return "";
  }
}

function removePortlessBlock(content) {
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1) return content;
  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + MARKER_END.length);
  return (before + after).replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function writePortlessHostsEntry(hostname) {
  const content = readHostsFile();
  const lines = removePortlessBlock(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#") || line.includes(MARKER_START));

  const withoutHostname = lines.filter((line) => {
    const parts = line.split(/\s+/);
    return !parts.slice(1).includes(hostname);
  });

  const block = `${MARKER_START}
127.0.0.1 ${hostname}
${MARKER_END}`;

  const next = `${withoutHostname.join("\n").trimEnd()}\n\n${block}\n`;
  fs.writeFileSync(HOSTS_PATH, next);
}

async function hostResolvesToLocalhost(hostname) {
  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    return address === "127.0.0.1";
  } catch {
    return false;
  }
}

function printHostsHelp(hostname) {
  console.error(`
Cannot resolve ${hostname}.

Unlike .localhost, the custom .${PORTLESS_TLD} TLD does not resolve automatically.
Add a hosts entry (requires Administrator on Windows):

  Option 1 — open PowerShell as Administrator, then:
    npm run sync:hosts

  Option 2 — edit ${HOSTS_PATH} as Administrator and add:
    127.0.0.1 ${hostname}

  Option 3 — skip portless and use plain HTTP:
    npm run dev
    Open http://127.0.0.1:3000

  Option 4 — use .localhost instead (no hosts edit):
    PowerShell:
      $env:PORTLESS_TLD="localhost"; npm run start:dev
    CMD:
      set PORTLESS_TLD=localhost && npm run start:dev
`);
}

async function ensureCustomTldHosts(env) {
  const tld = env.PORTLESS_TLD || PORTLESS_TLD;
  if (tld === "localhost") return true;

  const hostname = portlessHostname(tld);
  if (await hostResolvesToLocalhost(hostname)) {
    return true;
  }

  console.log(`> Syncing ${hostname} into hosts file...`);
  try {
    writePortlessHostsEntry(hostname);
  } catch {
    printHostsHelp(hostname);
    return false;
  }

  if (await hostResolvesToLocalhost(hostname)) {
    console.log(`> ${hostname} -> 127.0.0.1`);
    return true;
  }

  printHostsHelp(hostname);
  return false;
}

function runPortless(portlessArgs, env) {
  if (!fs.existsSync(PORTLESS_CLI)) {
    console.error("portless is not installed. Run: npm install");
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [PORTLESS_CLI, ...portlessArgs], {
    stdio: "inherit",
    env,
  });

  process.exit(result.status ?? 1);
}

async function main() {
  const env = buildEnv();
  const args = process.argv.slice(2);

  if (args[0] === "trust") {
    runPortless(["trust"], env);
  }

  if (args[0] === "sync-hosts") {
    applyPortlessDefaults(env);
    const ok = await ensureCustomTldHosts(env);
    process.exit(ok ? 0 : 1);
  }

  applyPortlessDefaults(env);
  const hostsOk = await ensureCustomTldHosts(env);
  if (!hostsOk) {
    process.exit(1);
  }

  runPortless(args, env);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
