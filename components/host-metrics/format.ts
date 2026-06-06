export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatGbFromMb(mb: number | null | undefined): string {
  if (mb === null || mb === undefined) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}%`;
}

export function formatStorage(usedGb: number | null | undefined, totalGb: number | null | undefined): string {
  if (usedGb === null || totalGb === null || usedGb === undefined || totalGb === undefined) return "—";
  return `${usedGb} / ${totalGb} GB`;
}

export function formatRam(usedMb: number | null | undefined, totalMb: number | null | undefined): string {
  if (usedMb === null || totalMb === null || usedMb === undefined || totalMb === undefined) return "—";
  const usedGb = usedMb / 1024;
  const totalGb = totalMb / 1024;
  if (totalGb >= 1) return `${usedGb.toFixed(1)} / ${totalGb.toFixed(1)} GB`;
  return `${usedMb} / ${totalMb} MB`;
}

export function utilColor(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "bg-zinc-600";
  if (pct >= 90) return "bg-red-500";
  if (pct >= 75) return "bg-amber-500";
  return "bg-emerald-500";
}
