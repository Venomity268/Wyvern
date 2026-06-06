import { statfs } from "fs/promises";
import os from "os";
import { dirname, join } from "path";
import type { ServerStats } from "./types";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

async function sampleCpuUtilPct(): Promise<number | null> {
  const cpus = os.cpus();
  if (cpus.length === 0) return null;

  const snapshot = cpus.map((cpu) => cpu.times);
  await new Promise((resolve) => setTimeout(resolve, 120));

  const next = os.cpus();
  let idleDiff = 0;
  let totalDiff = 0;

  for (let i = 0; i < next.length; i += 1) {
    const prev = snapshot[i];
    const curr = next[i].times;
    const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq;
    idleDiff += curr.idle - prev.idle;
    totalDiff += currTotal - prevTotal;
  }

  if (totalDiff <= 0) return null;
  return round1(Math.max(0, Math.min(100, (1 - idleDiff / totalDiff) * 100)));
}

async function readDiskStats(): Promise<{
  disk_total_gb: number | null;
  disk_used_gb: number | null;
  disk_util_pct: number | null;
}> {
  const dbPath = process.env.DATABASE_PATH || join(process.cwd(), "data", "bastion.db");
  const diskPath = dirname(dbPath);

  try {
    const stats = await statfs(diskPath);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    const usedBytes = totalBytes - freeBytes;

    if (totalBytes <= 0) {
      return { disk_total_gb: null, disk_used_gb: null, disk_util_pct: null };
    }

    const disk_total_gb = round1(totalBytes / 1024 ** 3);
    const disk_used_gb = round1(usedBytes / 1024 ** 3);
    const disk_util_pct = round1((usedBytes / totalBytes) * 100);

    return { disk_total_gb, disk_used_gb, disk_util_pct };
  } catch {
    return { disk_total_gb: null, disk_used_gb: null, disk_util_pct: null };
  }
}

function platformLabel(platform: string): string {
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Linux";
  return platform;
}

export async function collectServerStats(): Promise<ServerStats> {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();
  const load = os.loadavg();
  const hasLoad = load.some((value) => value > 0);
  const cpuUtilFromLoad =
    hasLoad && cpus.length > 0 ? round1(Math.min(100, (load[0] / cpus.length) * 100)) : null;
  const cpuUtilPct = cpuUtilFromLoad ?? (await sampleCpuUtilPct());
  const disk = await readDiskStats();

  return {
    hostname: os.hostname(),
    platform: platformLabel(os.platform()),
    release: os.release(),
    arch: os.arch(),
    node_version: process.version,
    cpu_count: cpus.length,
    cpu_model: cpus[0]?.model?.trim() || null,
    cpu_util_pct: cpuUtilPct,
    load_avg: hasLoad ? [round1(load[0]), round1(load[1]), round1(load[2])] : null,
    memory_total_mb: Math.round(totalMem / 1024 ** 2),
    memory_used_mb: Math.round(usedMem / 1024 ** 2),
    memory_util_pct: round1((usedMem / totalMem) * 100),
    disk_total_gb: disk.disk_total_gb,
    disk_used_gb: disk.disk_used_gb,
    disk_util_pct: disk.disk_util_pct,
    uptime_seconds: Math.round(os.uptime()),
    collected_at: new Date().toISOString(),
  };
}
