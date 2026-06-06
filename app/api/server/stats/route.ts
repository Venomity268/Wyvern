import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { collectServerStats } from "@/lib/server-stats/collect";

export async function GET() {
  try {
    await requireSession();
    const stats = await collectServerStats();
    return NextResponse.json({ stats });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[server/stats]", err);
    return NextResponse.json({ error: "Failed to collect server stats" }, { status: 500 });
  }
}
