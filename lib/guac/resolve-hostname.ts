import { lookup } from "dns/promises";

/** Resolve for guacd (Docker often lacks mDNS/LLMNR that the host has). */
export async function resolveGuacdHostname(hostname: string): Promise<string> {
  const trimmed = hostname.trim();
  if (!trimmed) return trimmed;
  // Already an IP literal — lookup would work but no need.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed) || trimmed.includes(":")) {
    return trimmed;
  }
  try {
    const { address } = await lookup(trimmed, { verbatim: true });
    return address;
  } catch {
    return trimmed;
  }
}
