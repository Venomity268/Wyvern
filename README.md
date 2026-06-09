# Wyvern

Self-hosted SSH, VNC, and RDP manager with team workspaces. Connect to servers and desktops from the browser — terminals, file managers, and remote desktops in one place.

## Features

### Connections & workspaces

- **Multi-protocol hosts** — each connection can expose SSH, VNC, and/or RDP on separate ports with per-method credentials
- **Workspaces** — personal workspace plus shared team workspaces with members, folders, and tags
- **Quick connect** — jump in without saving; optionally save to a workspace later
- **Encrypted credential vault** — passwords and private keys stored with AES-256-GCM; never sent to the browser when using stored credentials
- **Pinned connections**, connection history, and active session overview on the home dashboard
- **Wake-on-LAN** for sleeping VNC/RDP targets (optional MAC address per connection)

### SSH sessions

- In-browser terminals via [@wterm/react](https://wterm.dev) (Ghostty-backed)
- **Split panes and tabs** — horizontal/vertical splits, drag-and-drop tab reorder, broadcast input to all panes
- **SFTP file manager** — browse, upload, download, edit, chmod, compress/extract; sudo retry for privileged ops
- **Port forwarding** — local/remote forwards with bind address (`127.0.0.1` or `0.0.0.0`)
- **Docker panel** — list containers and attach exec shells in new panes
- **Snippets** — reusable command templates
- **Session recording** — asciinema `.cast` replay from the dashboard
- **Zmodem** file transfer over the terminal
- Mobile-friendly layout with collapsible sidebar and touch toolbar

### Desktop sessions (VNC & RDP)

- Remote desktops via [Apache Guacamole](https://guacamole.apache.org) (`guacd` + `guacamole-common-js`)
- VNC — Linux desktops, **macOS Screen Sharing**, TigerVNC, etc.
- RDP — Windows Remote Desktop and xrdp
- Clipboard sync, zoom/fit modes, paste panel; Ctrl+Alt+Del for RDP
- **Embedded SSH panel** when the same host also has SSH enabled
- SSH tunnel port forwarding from desktop sessions

### Administration & security

- Role-based access (`user` / `admin`) with workspace membership
- Admin user management
- Audit log API for workspace changes
- TOTP two-factor authentication
- Profile settings (display name, avatar, password)
- Host metrics collection over SSH (CPU, memory, disk, uptime)
- Wyvern-managed SSH keypair (`__bastion__`) and per-connection deploy keys

## Quick start (development)

Requires **Node.js 24+** and **Docker** (for `guacd`).

On Windows, use your system Node install (`node -v` should report 24.x). Cursor’s bundled Node can mismatch native modules such as `better-sqlite3`.

```bash
cp .env.example .env
# Edit .env — set SESSION_SECRET, CREDENTIAL_ENCRYPTION_KEY, and GUAC_TOKEN_SECRET (32+ chars each)

npm install

# Start guacd (required for VNC and RDP)
npm run setup:guacd

# Copy terminal WASM assets
npm run predev
```

### Option A — direct dev server (simplest)

```bash
npm run dev
```

Open **http://localhost:3000** and sign in with the seeded admin account (defaults in `.env.example`).

### Option B — portless HTTPS (`https://wyvern.cain`)

```bash
# Install OpenSSL (required for portless HTTPS on Windows)
#   winget install -e --id ShiningLight.OpenSSL.Dev
# Or use Git for Windows which bundles OpenSSL.

# Trust the local CA (first time only; on Windows, run PowerShell as Administrator)
npm run setup:portless

npm run start:dev
```

Open **https://wyvern.cain** on this machine.

**Windows hosts file:** `.cain` does not resolve automatically. `npm run setup:portless` and `npm run start:dev` add `127.0.0.1 wyvern.cain` to your hosts file — **run both in an elevated (Administrator) PowerShell** the first time. If the browser still cannot connect, run `npm run sync:hosts` as Administrator.

**LAN access:** The app binds to `0.0.0.0` by default (`BASTION_BIND`), so other devices can reach the assigned portless port (shown in the terminal, e.g. `http://<your-lan-ip>:4352`) once the firewall allows inbound traffic. For HTTPS via portless, use **https://wyvern.cain** with `*.cain` DNS (or a hosts entry on each client) pointing at this machine’s LAN IP. Other devices must run `npm run setup:portless` once to trust the local CA.

If a previous portless proxy used different settings, stop it first: `npx portless proxy stop`

### Dev scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Custom server on `PORT` (default 3000) — SSH, SFTP, and Guacamole WebSockets |
| `npm run start:dev` | Same app via [portless](https://portless.sh) at `https://wyvern.cain` |
| `npm run setup:guacd` | Build and start the `guacd` Docker container on port 4822 |
| `npm run setup:portless` | Trust local CA + sync hosts (requires OpenSSL; **Administrator on Windows**) |
| `npm run sync:hosts` | Add `wyvern.cain` to hosts file (**Administrator on Windows**) |
| `npm run build` | Production Next.js build |
| `npm start` | Production server (`tsx server.ts`) |
| `npm run type-check` | TypeScript check |

## Production (Docker Compose)

```bash
cp .env.example .env
# Set strong SESSION_SECRET, CREDENTIAL_ENCRYPTION_KEY, GUAC_TOKEN_SECRET, ADMIN_PASSWORD

docker compose up -d --build
```

Docker Compose starts **guacd** and **bastion** together. Put **nginx** or **Caddy** in front for TLS on port 443. Example Caddy:

```
bastion.example.com {
    reverse_proxy localhost:3000
}
```

WebSocket upgrades to `/api/ssh`, `/api/sftp`, and `/api/guac` must be proxied (Caddy and nginx handle this automatically with standard reverse proxy config).

## Architecture

| Layer | Technology |
|-------|------------|
| UI & REST API | Next.js 16 App Router, React 19, Tailwind CSS 4 |
| Custom server | `server.ts` — HTTP + WebSocket upgrade routing |
| SSH terminal | `ws` + `ssh2` bridge → [@wterm/react](https://wterm.dev) |
| SFTP files | `ws` + `ssh2` SFTP bridge |
| VNC / RDP | `guacamole-lite` → `guacd` (Docker) → remote host |
| Database | SQLite (`better-sqlite3`) — users, workspaces, connections, credentials, history, recordings |
| Auth | `iron-session` cookies; credentials encrypted at rest |

### WebSocket endpoints

| Path | Purpose |
|------|---------|
| `/api/ssh` | Interactive SSH shell (multiplexed panes per connection) |
| `/api/sftp` | SFTP file manager |
| `/api/guac` | Guacamole tunnel for VNC/RDP |

## Workspace model

| Type | Created | Who can connect |
|------|---------|-----------------|
| Personal | Automatically for each user | Only that user |
| Shared | By any user (`/workspaces/new`) | Workspace members |

Each workspace holds its own connections, folders, credentials, and tags. Users only see workspaces they belong to. Admins have global user-management access but cannot read another user’s personal workspace credentials.

Connections support **multiple access methods** on one host — for example SSH on port 22 and VNC on 5900 — each with its own port and optional credential override.

## Pages

| Path | Description |
|------|-------------|
| `/login` | Sign in |
| `/` | Dashboard — pinned connections, recent history, active sessions, server stats, recording replays |
| `/connect` | Quick connect (SSH, VNC, or RDP without saving) |
| `/connect/[quickId]` | Active quick-connect session |
| `/workspace/[workspaceId]` | Manage connections, folders, and credentials in a workspace |
| `/workspaces/new` | Create a shared workspace |
| `/session/[connectionId]` | Full-screen session (`?via=ssh`, `?via=vnc`, or `?via=rdp` to pick method) |
| `/settings` | Profile, avatar, password, TOTP 2FA |
| `/admin/users` | Admin: user management |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | Yes | Cookie encryption (32+ chars) |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | AES key for stored passwords/keys |
| `GUAC_TOKEN_SECRET` | Yes | AES key for Guacamole WS tokens (32+ chars) |
| `GUACD_HOST` | No | guacd hostname (default: `127.0.0.1`; `guacd` in Docker Compose) |
| `GUACD_PORT` | No | guacd port (default: 4822) |
| `GUAC_MAX_INACTIVITY_MS` | No | WebSocket client idle timeout (default: 28800000 = 8h; 0 = disable) |
| `GUAC_GUACD_IDLE_MS` | No | guacd TCP idle timeout (default: 3600000 = 1h; 0 = disable) |
| `ADMIN_EMAIL` | No | First admin email (default: `admin@localhost`) |
| `ADMIN_PASSWORD` | No | First admin password (default: `admin123`) |
| `DATABASE_PATH` | No | SQLite file path (default: `./data/bastion.db`) |
| `BASTION_BIND` | No | App listen address (default: `0.0.0.0`) |
| `HOST` | No | Legacy bind alias (overridden by `BASTION_BIND` when set) |
| `PORT` | No | Listen port (default: 3000) |
| `PORTLESS_LAN` | No | Portless LAN mode (default: `1` via `start:dev`; set `0` to disable) |
| `PORTLESS_TLD` | No | Portless TLD (default: `cain`) |
| `BASTION_DEV_ORIGINS` | No | Extra Next.js `allowedDevOrigins` in dev (comma-separated, e.g. Tailscale IP) |
| `GUACD_CONTAINER` | No | Docker container name for `setup:guacd` (default: `guacd`) |
| `GUACD_IMAGE` | No | Docker image tag for guacd (default: `wterm-guacd:1.6.0`) |

## macOS Screen Sharing (VNC)

When connecting to a Mac over VNC:

1. Enable **Screen Sharing** in System Settings → General → Sharing.
2. Use either:
   - **Mac username + login password**, or
   - A **dedicated VNC password** set under Screen Sharing → Info (ⓘ) → “VNC viewers may control screen with password”.
3. Default port is **5900**. Tailscale/VPN IPs (e.g. `100.x.x.x`) work as long as `guacd` can reach the host — the app resolves hostnames to IPs before handing them to guacd.

If you see a timeout, verify credentials first; macOS often requires a username even when other VNC servers do not.

## Security notes

- Always use HTTPS/WSS in production.
- Change default admin credentials immediately.
- VNC/RDP passwords are issued as short-lived encrypted Guacamole tokens server-side; they are not exposed in the browser when using stored credentials.
- Private keys in the vault never reach the browser.
- SSH/SFTP bridges idle-timeout after 8 hours; desktop sessions use `GUAC_MAX_INACTIVITY_MS` / `GUAC_GUACD_IDLE_MS` (defaults: 8h WebSocket, 1h guacd). The desktop viewer sends keepalive messages every 30s while connected.
