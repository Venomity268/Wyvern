/** Normalize user-entered host strings (strip schemes, user@host, host:port). */
export function normalizeConnectionTarget(
  hostname: string,
  defaultPort?: number,
): { hostname: string; port?: number } {
  let host = hostname.trim();
  if (!host) return { hostname: "", port: defaultPort };

  const schemeMatch = host.match(/^[a-z][a-z0-9+.-]*:\/\//i);
  if (schemeMatch) {
    host = host.slice(schemeMatch[0].length);
  }

  const atIdx = host.lastIndexOf("@");
  if (atIdx !== -1) {
    host = host.slice(atIdx + 1);
  }

  host = host.split("/")[0].split("?")[0];

  const v6 = host.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (v6) {
    return {
      hostname: v6[1],
      port: v6[2] ? parseInt(v6[2], 10) : defaultPort,
    };
  }

  const colon = host.match(/^([^:/\s]+):(\d+)$/);
  if (colon) {
    return { hostname: colon[1], port: parseInt(colon[2], 10) };
  }

  return { hostname: host, port: defaultPort };
}
