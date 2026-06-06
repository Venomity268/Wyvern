import { Client } from "ssh2";
import type { ResolvedSshConnection } from "../bridges/ssh-connect";
import type {
  HostMetricsSnapshot,
  HostPortInfo,
  HostProcessInfo,
  HostServiceInfo,
} from "./types";

const COLLECT_SCRIPT = `
set -eu
echo "@META"
echo "FQDN=$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo)"
if [ -f /etc/os-release ]; then
  . /etc/os-release
  echo "OS_NAME=$NAME"
  echo "OS_VERSION=$VERSION_ID"
fi
echo "KERNEL=$(uname -r 2>/dev/null || echo)"
echo "CPU=$(lscpu 2>/dev/null | awk -F: '/Model name/ {gsub(/^ +/,"",$2); print $2; exit}')"
echo "CPUS=$(nproc 2>/dev/null || echo 1)"
read -r L1 L2 L3 _rest < /proc/loadavg || true
echo "LOAD1=$L1"
echo "LOAD5=$L2"
echo "LOAD15=$L3"
echo "UPTIME=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)"
read -r MT MU MA MF <<< "$(free -m 2>/dev/null | awk '/^Mem:/ {print $2,$3,$7,$4}')"
echo "MEM_TOTAL=$MT"
echo "MEM_USED=$MU"
echo "MEM_AVAIL=$MA"
if [ -n "$MT" ] && [ "$MT" -gt 0 ] 2>/dev/null; then
  echo "MEM_PCT=$(awk "BEGIN {printf \\"%.1f\\", ($MU/$MT)*100}")"
else
  echo "MEM_PCT=0"
fi
read -r DT DU DA DP <<< "$(df -BM / 2>/dev/null | awk 'NR==2 {gsub(/M/,"",$2); gsub(/M/,"",$3); gsub(/M/,"",$4); gsub(/%/,"",$5); print $2,$3,$4,$5}')"
echo "DISK_TOTAL_MB=$DT"
echo "DISK_USED_MB=$DU"
echo "DISK_AVAIL_MB=$DA"
echo "DISK_PCT=$DP"
IFACE=$(ip route show default 2>/dev/null | awk '{print $5; exit}')
if [ -n "$IFACE" ] && [ -r /proc/net/dev ]; then
  read -r RX TX <<< "$(awk -v iface="$IFACE:" '$1==iface {print $2,$10}' /proc/net/dev)"
  echo "NET_RX_MB=$(awk "BEGIN {printf \\"%.1f\\", $RX/1048576}")"
  echo "NET_TX_MB=$(awk "BEGIN {printf \\"%.1f\\", $TX/1048576}")"
fi
if command -v top >/dev/null 2>&1; then
  IDLE=$(top -bn1 | awk -F',' '/%Cpu\\(s\\)/ {
    for (i=1;i<=NF;i++) if ($i ~ /id/) { gsub(/[^0-9.]/,"",$i); print $i; exit }
  }')
  if [ -n "$IDLE" ]; then
    echo "CPU_PCT=$(awk "BEGIN {printf \\"%.1f\\", 100-$IDLE}")"
  fi
fi
echo "@PROCS"
ps -eo pid=,user=,pcpu=,pmem=,comm= --sort=-pcpu 2>/dev/null | head -n 15 | while read -r PID USER CPU MEM COMM; do
  echo "$PID|$USER|$CPU|$MEM|$COMM"
done
echo "@SERVICES"
systemctl --user list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | head -n 25 | while read -r UNIT LOAD ACTIVE SUB DESC; do
  REST="$DESC"
  echo "$UNIT|$ACTIVE|$REST"
done
echo "@PORTS"
if command -v ss >/dev/null 2>&1; then
  ss -tulpn 2>/dev/null | tail -n +2 | head -n 40 | while read -r NET STATE RECV SEND LOCAL REMOTE PROC; do
    PROTO=$(echo "$NET" | tr '[:upper:]' '[:lower:]')
    ADDR=$(echo "$LOCAL" | sed 's/\\[//g;s/\\]//g')
    PORT=$(echo "$ADDR" | awk -F: '{print $NF}')
    HOST=$(echo "$ADDR" | sed 's/:.*//')
    PNAME=$(echo "$PROC" | sed -n 's/.*(\\"\\([^\\"]\\+\\)".*/\\1/p')
    [ -z "$PNAME" ] && PNAME=$(echo "$PROC" | sed 's/users:((\\"//;s/\\".*//')
    echo "$PROTO|$HOST|$PORT|$PNAME"
  done
elif command -v netstat >/dev/null 2>&1; then
  netstat -tulpn 2>/dev/null | tail -n +3 | head -n 40 | while read -r PROTO RECV SEND LOCAL ADDRESS STATE PID_PROG; do
    PORT=$(echo "$ADDRESS" | awk -F: '{print $NF}')
    HOST=$(echo "$ADDRESS" | sed 's/:.*//')
    PNAME=$(echo "$PID_PROG" | awk -F/ '{print $2}')
    echo "$PROTO|$HOST|$PORT|$PNAME"
  done
fi
`.trim();

function parseFloat(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function parseProcesses(lines: string[]): HostProcessInfo[] {
  const processes: HostProcessInfo[] = [];
  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 5) continue;
    const pid = parseIntSafe(parts[0]);
    if (pid === null) continue;
    processes.push({
      pid,
      user: parts[1] || "?",
      cpu_pct: parseFloat(parts[2]) ?? 0,
      mem_pct: parseFloat(parts[3]) ?? 0,
      command: parts.slice(4).join("|") || "?",
    });
  }
  return processes;
}

function parseServices(lines: string[]): HostServiceInfo[] {
  const services: HostServiceInfo[] = [];
  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 2) continue;
    services.push({
      name: parts[0] || "?",
      state: parts[1] || "unknown",
      description: parts.slice(2).join("|").trim(),
    });
  }
  return services;
}

function parsePorts(lines: string[]): HostPortInfo[] {
  const ports: HostPortInfo[] = [];
  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 3) continue;
    const port = parseIntSafe(parts[2]);
    if (port === null) continue;
    ports.push({
      protocol: parts[0] || "?",
      address: parts[1] || "*",
      port,
      process: parts[3] || "",
    });
  }
  return ports;
}

export function parseCollectOutput(output: string): HostMetricsSnapshot {
  const raw: Record<string, string> = {};
  let section: "meta" | "procs" | "services" | "ports" = "meta";
  const procLines: string[] = [];
  const serviceLines: string[] = [];
  const portLines: string[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "@META") {
      section = "meta";
      continue;
    }
    if (trimmed === "@PROCS") {
      section = "procs";
      continue;
    }
    if (trimmed === "@SERVICES") {
      section = "services";
      continue;
    }
    if (trimmed === "@PORTS") {
      section = "ports";
      continue;
    }

    if (section === "meta") {
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      raw[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).trim();
    } else if (section === "procs") {
      procLines.push(trimmed);
    } else if (section === "services") {
      serviceLines.push(trimmed);
    } else if (section === "ports") {
      portLines.push(trimmed);
    }
  }

  const load1 = parseFloat(raw.LOAD1);
  const load5 = parseFloat(raw.LOAD5);
  const load15 = parseFloat(raw.LOAD15);
  const diskTotalMb = parseFloat(raw.DISK_TOTAL_MB);

  return {
    fqdn: raw.FQDN || null,
    os_name: raw.OS_NAME || null,
    os_version: raw.OS_VERSION || null,
    kernel: raw.KERNEL || null,
    cpu_model: raw.CPU || null,
    cpu_count: parseIntSafe(raw.CPUS),
    cpu_util_pct: parseFloat(raw.CPU_PCT),
    load_avg: load1 !== null && load5 !== null && load15 !== null ? [load1, load5, load15] : null,
    memory_total_mb: parseIntSafe(raw.MEM_TOTAL),
    memory_used_mb: parseIntSafe(raw.MEM_USED),
    memory_available_mb: parseIntSafe(raw.MEM_AVAIL),
    memory_util_pct: parseFloat(raw.MEM_PCT),
    disk_total_gb: diskTotalMb !== null ? Math.round((diskTotalMb / 1024) * 10) / 10 : null,
    disk_used_gb:
      parseFloat(raw.DISK_USED_MB) !== null ?
        Math.round((parseFloat(raw.DISK_USED_MB)! / 1024) * 10) / 10
      : null,
    disk_available_gb:
      parseFloat(raw.DISK_AVAIL_MB) !== null ?
        Math.round((parseFloat(raw.DISK_AVAIL_MB)! / 1024) * 10) / 10
      : null,
    disk_util_pct: parseFloat(raw.DISK_PCT),
    uptime_seconds: parseIntSafe(raw.UPTIME),
    network_rx_mb: parseFloat(raw.NET_RX_MB),
    network_tx_mb: parseFloat(raw.NET_TX_MB),
    processes: parseProcesses(procLines),
    user_services: parseServices(serviceLines),
    listening_ports: parsePorts(portLines),
    history: [],
    collected_at: new Date().toISOString(),
    collection_error: null,
    raw,
  };
}

function execScript(
  client: Client,
  script: string,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    client.exec(script, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let stdout = "";
      let stderr = "";
      stream
        .on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        })
        .stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
      stream.on("close", (code: number | null) => {
        resolve({ stdout, stderr, code });
      });
    });
  });
}

function emptySnapshot(error: string): HostMetricsSnapshot {
  return {
    fqdn: null,
    os_name: null,
    os_version: null,
    kernel: null,
    cpu_model: null,
    cpu_count: null,
    cpu_util_pct: null,
    load_avg: null,
    memory_total_mb: null,
    memory_used_mb: null,
    memory_available_mb: null,
    memory_util_pct: null,
    disk_total_gb: null,
    disk_used_gb: null,
    disk_available_gb: null,
    disk_util_pct: null,
    uptime_seconds: null,
    network_rx_mb: null,
    network_tx_mb: null,
    processes: [],
    user_services: [],
    listening_ports: [],
    history: [],
    collected_at: new Date().toISOString(),
    collection_error: error,
    raw: {},
  };
}

export async function collectHostInfoViaSsh(
  resolved: ResolvedSshConnection,
): Promise<HostMetricsSnapshot> {
  const { connection, username, password, privateKey, passphrase } = resolved;

  return new Promise((resolve) => {
    const client = new Client();
    const fail = (message: string) => {
      client.end();
      resolve(emptySnapshot(message));
    };

    client
      .on("ready", () => {
        void execScript(client, COLLECT_SCRIPT)
          .then(({ stdout, stderr, code }) => {
            client.end();
            if (code !== 0 && !stdout.trim()) {
              resolve({
                ...emptySnapshot(stderr.trim() || `Remote command failed (${code})`),
              });
              return;
            }
            const parsed = parseCollectOutput(stdout);
            if (!parsed.os_name && !parsed.kernel && !parsed.memory_total_mb && stderr.trim()) {
              parsed.collection_error = stderr.trim();
            }
            parsed.collected_at = new Date().toISOString();
            resolve(parsed);
          })
          .catch((err) => {
            fail(err instanceof Error ? err.message : "Collection failed");
          });
      })
      .on("error", (err) => {
        fail(err.message || "SSH connection failed");
      })
      .connect({
        host: connection.hostname,
        port: connection.port,
        username,
        password,
        privateKey,
        passphrase,
        readyTimeout: 15_000,
      });
  });
}
