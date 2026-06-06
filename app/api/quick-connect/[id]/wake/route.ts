import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { getQuickSession } from "@/lib/quick-connect";
import {
  sendWakeOnLanBurst,
  normalizeMacAddress,
  broadcastTargetsForHost,
} from "@/lib/wol";
import { waitForHostPort } from "@/lib/host-reachability";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const waitForWake = body.wait !== false;

    const db = getDb();
    const quick = getQuickSession(db, user.id, id);
    if (!quick) {
      return NextResponse.json({ error: "Quick session not found or expired" }, { status: 404 });
    }

    if (quick.protocol !== "vnc" && quick.protocol !== "rdp") {
      return NextResponse.json({ error: "Wake supports VNC and RDP quick sessions" }, { status: 400 });
    }

    const mac = quick.mac_address ? normalizeMacAddress(quick.mac_address) : null;
    if (!mac) {
      return NextResponse.json({ error: "No MAC address configured for wake-on-LAN" }, { status: 400 });
    }

    const broadcastTargets = broadcastTargetsForHost(quick.hostname);

    await sendWakeOnLanBurst(mac, broadcastTargets);

    let ready = false;
    if (waitForWake) {
      ready = await waitForHostPort(quick.hostname, quick.port, {
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
      hostname: quick.hostname,
      port: quick.port,
      broadcasts: broadcastTargets,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[quick-connect/wake]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Wake failed" },
      { status: 500 },
    );
  }
}
