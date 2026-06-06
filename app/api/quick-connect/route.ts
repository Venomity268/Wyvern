import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb, createPersonalWorkspace } from "@/lib/db/index";
import { createQuickSession } from "@/lib/quick-connect";
import type { ConnectionProtocol } from "@/lib/protocols";
import { defaultPort } from "@/lib/protocols";
import { normalizeMacAddress } from "@/lib/wol";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    const body = await request.json();
    const {
      protocol,
      hostname,
      port,
      label,
      username,
      password,
      privateKey,
      macAddress: macAddressInput,
    } = body as {
      protocol?: ConnectionProtocol;
      hostname?: string;
      port?: number;
      label?: string;
      username?: string;
      password?: string;
      privateKey?: string;
      macAddress?: string;
    };

    if (!protocol || !["ssh", "vnc", "rdp"].includes(protocol)) {
      return NextResponse.json({ error: "Valid protocol required" }, { status: 400 });
    }

    if (!hostname?.trim()) {
      return NextResponse.json({ error: "Hostname required" }, { status: 400 });
    }

    if (protocol === "ssh" && !password && !privateKey) {
      return NextResponse.json({ error: "Password or private key required" }, { status: 400 });
    }

    if ((protocol === "vnc" || protocol === "rdp") && !password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    if (protocol === "rdp" && !username?.trim()) {
      return NextResponse.json({ error: "Username required for RDP" }, { status: 400 });
    }

    const macAddress = macAddressInput?.trim()
      ? normalizeMacAddress(macAddressInput)
      : null;
    if (macAddressInput?.trim() && !macAddress) {
      return NextResponse.json({ error: "Invalid MAC address format" }, { status: 400 });
    }

    const db = getDb();
    const session = createQuickSession(db, user.id, {
      protocol,
      hostname: hostname.trim(),
      port: port || defaultPort(protocol),
      label: label?.trim(),
      username: username?.trim(),
      password,
      privateKey,
      macAddress: macAddress ?? undefined,
    });

    return NextResponse.json({
      id: session.id,
      protocol: session.protocol,
      hostname: session.hostname,
      port: session.port,
      label: session.label,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[quick-connect]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create quick session" },
      { status: 500 },
    );
  }
}
