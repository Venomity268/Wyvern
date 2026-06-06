import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { canViewConnection } from "@/lib/auth/access";
import { getMethodPort } from "@/lib/db/connection-methods";
import { resolveSshConnection } from "@/lib/bridges/ssh-connect";
import { collectHostInfoViaSsh } from "@/lib/host-info/collect";
import { detailToSummary } from "@/lib/host-info/summary";
import {
  upsertConnectionHostInfo,
  getConnectionHostInfo,
  rowToHostMetrics,
  rowToHostMetricsSummary,
} from "@/lib/db/host-info";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireSession();
    const { id } = await params;

    const connection = getDb().prepare("SELECT * FROM connections WHERE id = ?").get(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (!canViewConnection(user, connection as Parameters<typeof canViewConnection>[1])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const row = getConnectionHostInfo(getDb(), id);
    return NextResponse.json({
      summary: rowToHostMetricsSummary(row),
      detail: rowToHostMetrics(row),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load host info" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const summaryOnly = body.summaryOnly !== false;

    const connection = getDb().prepare("SELECT * FROM connections WHERE id = ?").get(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (!canViewConnection(user, connection as Parameters<typeof canViewConnection>[1])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sshPort = getMethodPort(getDb(), id, "ssh");
    if (sshPort === null) {
      return NextResponse.json(
        { error: "SSH must be enabled to collect system information" },
        { status: 400 },
      );
    }

    const resolved = resolveSshConnection(user, id);
    if ("error" in resolved) {
      return NextResponse.json(
        { error: resolved.error, needsAuth: resolved.needsAuth },
        { status: resolved.needsAuth ? 400 : 403 },
      );
    }

    const snapshot = await collectHostInfoViaSsh(resolved);
    upsertConnectionHostInfo(getDb(), id, snapshot);

    const row = getConnectionHostInfo(getDb(), id);
    const detail = rowToHostMetrics(row);
    const summary = detail ? detailToSummary(detail) : rowToHostMetricsSummary(row);

    return NextResponse.json({
      summary,
      detail: summaryOnly ? undefined : detail,
      ok: !snapshot.collection_error,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[connections/collect-info]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Collection failed" },
      { status: 500 },
    );
  }
}
