# wterm Bastion

Self-hosted web SSH and VNC manager. Every user gets a **personal workspace** for their own connections; admins curate a **shared workspace** for team-wide hosts.

## Features

- SSH terminals in the browser via [@wterm/react](https://wterm.dev)
- VNC desktops via [Apache Guacamole](https://guacamole.apache.org) (`guacd` + `guacamole-common-js`)
- Personal connections and encrypted credential vault (no admin required)
- Shared team connections managed by admins
- Per-user connection history and admin audit log for shared workspace changes

## Quick Start (Development)

Requires **Node.js 24+** and **Docker** (for guacd).

```bash
cp .env.example .env
# Edit .env — set SESSION_SECRET, CREDENTIAL_ENCRYPTION_KEY, and GUAC_TOKEN_SECRET (32+ chars each)

# Start guacd (required for VNC and RDP)
npm run setup:guacd

npm install
npm run predev

# Install OpenSSL (required for portless HTTPS on Windows)
#   winget install -e --id ShiningLight.OpenSSL.Dev
# Or use Git for Windows which bundles OpenSSL.

# Trust the local CA (first time only; on Windows, run PowerShell as Administrator)
npm run setup:portless

npm run start:dev
```

Open **https://wterm-bastion.cain** on this machine and sign in with the seeded admin account (defaults in `.env.example`).

**Windows hosts file:** `.cain` does not resolve automatically. `npm run setup:portless` and `npm run start:dev` add `127.0.0.1 wterm-bastion.cain` to your hosts file — **run both in an elevated (Administrator) PowerShell** the first time. If the browser still cannot connect, run `npm run sync:hosts` as Administrator.

**LAN access:** The app binds to `0.0.0.0` by default (`BASTION_BIND`), so other devices can reach the assigned portless app port (shown in the terminal, e.g. `http://<your-lan-ip>:4352`) once Windows Firewall allows inbound traffic. For HTTPS via portless, use **https://wterm-bastion.cain** with `*.cain` DNS (or a hosts entry on each client) pointing at this machine’s LAN IP. Other devices must run `npm run setup:portless` once to trust the local CA.

If a previous portless proxy used different settings, stop it first: `npx portless proxy stop`

### Dev scripts

| Command | Description |
|---------|-------------|
| `npm run setup:portless` | Trust local CA + sync hosts (requires OpenSSL; **Administrator on Windows**) |
| `npm run sync:hosts` | Add `wterm-bastion.cain` to hosts file (**Administrator on Windows**) |
| `npm run start:dev` | Run via [portless](https://portless.sh) at `https://wterm-bastion.cain` |
| `npm run dev` | Run custom server directly on `PORT` (default 3000) |
| `npm run build` | Build Next.js |
| `npm start` | Production server (`tsx server.ts`) |

## Production (Docker)

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

WebSocket upgrades to `/api/ssh` and `/api/guac` must be proxied (Caddy and nginx handle this automatically with standard reverse proxy config).

## Architecture

- **Next.js 16** App Router for UI and REST API
- **Custom `server.ts`** — HTTP + WebSocket upgrades for SSH (wterm) and VNC (guacamole-lite → guacd)
- **guacd** — Apache Guacamole proxy daemon for VNC protocol handling
- **SQLite** (`better-sqlite3`) for users, connections, credentials, history
- **iron-session** cookie auth; credentials encrypted at rest with AES-256-GCM

## Workspace Model

| Workspace | Managed by | Who can connect |
|-----------|------------|-----------------|
| Personal | Each user | Only that user |
| Shared | Admins | All authenticated users |

Admins cannot view or modify another user's personal connections or credentials.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | Yes | Cookie encryption (32+ chars) |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | AES key for stored passwords/keys |
| `GUAC_TOKEN_SECRET` | Yes | AES key for Guacamole WS tokens (32+ chars) |
| `GUACD_HOST` | No | guacd hostname (default: 127.0.0.1; `guacd` in Docker Compose) |
| `GUACD_PORT` | No | guacd port (default: 4822) |
| `GUAC_MAX_INACTIVITY_MS` | No | WebSocket client idle timeout (default: 28800000 = 8h; 0 = disable) |
| `GUAC_GUACD_IDLE_MS` | No | guacd TCP idle timeout (default: 3600000 = 1h; 0 = disable) |
| `ADMIN_EMAIL` | No | First admin email (default: admin@localhost) |
| `ADMIN_PASSWORD` | No | First admin password (default: admin123) |
| `DATABASE_PATH` | No | SQLite file path (default: ./data/bastion.db) |
| `BASTION_BIND` | No | App listen address (default: `0.0.0.0`; use `127.0.0.1` to restrict to localhost) |
| `HOST` | No | Legacy bind alias (overridden by `BASTION_BIND` when set) |
| `PORT` | No | Listen port (default: 3000; portless assigns 4000–4999) |
| `PORTLESS_LAN` | No | Portless LAN mode (default: `1` via `start:dev`; set `0` to disable) |
| `PORTLESS_TLD` | No | Portless TLD (default: `cain`) |
| `BASTION_DEV_ORIGINS` | No | Extra Next.js `allowedDevOrigins` in dev (comma-separated, e.g. Tailscale IP) |

## Pages

- `/login` — Sign in
- `/` — Home with personal + shared connections and recent history
- `/workspace/personal` — Manage personal connections and credentials
- `/workspace/shared` — Browse team connections
- `/session/[connectionId]` — Full-screen SSH (wterm) or VNC (Guacamole) session
- `/admin/shared` — Admin: shared connections, credentials, audit log
- `/admin/users` — Admin: user management

## Security Notes

- Always use HTTPS/WSS in production
- Change default admin credentials immediately
- VNC passwords are issued as short-lived encrypted tokens server-side; they never appear in the browser when using stored credentials
- Private keys stored in credentials never reach the browser
- Sessions idle-timeout after 8 hours on SSH bridges; desktop sessions use `GUAC_MAX_INACTIVITY_MS` / `GUAC_GUACD_IDLE_MS` (defaults: 8h WS, 1h guacd)
