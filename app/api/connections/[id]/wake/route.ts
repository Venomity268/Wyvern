import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { canViewConnection } from "@/lib/auth/access";
import { getMethodPort } from "@/lib/db/connection-methods";
import {
  sendWakeOnLanBurst,
  normalizeMacAddress,
  broadcastTargetsForHost,
} from "@/lib/wol";
import { waitForHostPort } from "@/lib/host-reachability";
import type { GuacProtocol } from "@/lib/protocols";

interface RouteParams {
  params: Promise<{ id: string }>;
}

type ConnectionWakeRow = Parameters<typeof canViewConnection>[1] & {
  mac_address?: string | null;
  wol_broadcast?: string | null;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const via = body.via as GuacProtocol | undefined;
    const waitForWake = body.wait !== false;

    const connection = getDb()
      .prepare("SELECT * FROM connections WHERE id = ?")
      .get(id) as ConnectionWakeRow | undefined;

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    if (!canViewConnection(user, connection)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const mac = connection.mac_address ? normalizeMacAddress(connection.mac_address) : null;
    if (!mac) {
      return NextResponse.json({ error: "No MAC address configured for wake-on-LAN" }, { status: 400 });
    }

    let port = connection.port;
    if (via === "vnc" || via === "rdp") {
      const methodPort = getMethodPort(getDb(), id, via);
      if (methodPort !== null) port = methodPort;
    } else if (via) {
      return NextResponse.json({ error: "Wake supports VNC and RDP targets" }, { status: 400 });
    }

    const broadcastTargets = broadcastTargetsForHost(
      connection.hostname,
      connection.wol_broadcast,
    );

    // Always send WoL — a TCP probe can succeed while the desktop session is still asleep.
    await sendWakeOnLanBurst(mac, broadcastTargets);

    let ready = false;
    if (waitForWake) {
      ready = await waitForHostPort(connection.hostname, port, {
        timeoutMs: 180_000,
        intervalMs: 3_000,
        retryEveryMs: 15_000,
        onRetry: async () => {
          await sendWakeOnLanBurst(mac, broadcastTargets);
        },
      });
    }

    return NextResponse.json({
      ok: true,
      ready,
      woke: true,
      hostname: connection.hostname,
      port,
      broadcasts: broadcastTargets,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[connections/wake]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Wake failed" },
      { status: 500 },
    );
  }
}
