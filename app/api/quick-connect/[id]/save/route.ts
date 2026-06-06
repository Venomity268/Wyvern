import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireSession } from "@/lib/auth/session";
import { getDb, createPersonalWorkspace, logAudit } from "@/lib/db/index";
import { canViewWorkspace } from "@/lib/auth/access";
import { deleteQuickSession, getQuickSession } from "@/lib/quick-connect";
import { saveMethodsForConnection } from "@/lib/db/connection-methods";
import type { ConnectionProtocol } from "@/lib/protocols";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const body = await request.json();
    const {
      name,
      workspace_id: workspaceIdInput,
      saveCredential,
      credentialLabel,
    } = body as {
      name?: string;
      workspace_id?: string;
      saveCredential?: boolean;
      credentialLabel?: string;
    };

    const db = getDb();
    const quick = getQuickSession(db, user.id, id);
    if (!quick) {
      return NextResponse.json({ error: "Quick session not found or expired" }, { status: 404 });
    }

    let workspaceId = workspaceIdInput;
    if (!workspaceId) {
      workspaceId = createPersonalWorkspace(db, user.id).id;
    }

    if (!canViewWorkspace(user, workspaceId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const connectionName = name?.trim() || quick.label;
    let credentialId: string | null = null;

    if (saveCredential && (quick.encrypted_password || quick.encrypted_private_key)) {
      credentialId = uuidv4();
      db.prepare(
        `INSERT INTO credentials
          (id, workspace_id, owner_id, label, username, encrypted_password, encrypted_private_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        credentialId,
        workspaceId,
        user.id,
        credentialLabel?.trim() || `${connectionName} credential`,
        quick.username,
        quick.encrypted_password,
        quick.encrypted_private_key,
      );
    }

    const connectionId = uuidv4();
    db.prepare(
      `INSERT INTO connections
        (id, workspace_id, owner_id, name, hostname, port, protocol, username, credential_id, mac_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      connectionId,
      workspaceId,
      user.id,
      connectionName,
      quick.hostname,
      quick.port,
      quick.protocol,
      quick.username,
      credentialId,
      quick.mac_address,
    );

    saveMethodsForConnection(db, connectionId, [
      {
        protocol: quick.protocol as ConnectionProtocol,
        port: quick.port,
        credential_id: credentialId,
      },
    ]);

    deleteQuickSession(db, user.id, id);

    logAudit(user.id, "create", "connection", {
      id: connectionId,
      source: "quick-connect",
      protocol: quick.protocol,
    });

    return NextResponse.json({
      connectionId,
      workspaceId,
      name: connectionName,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[quick-connect/save]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save connection" },
      { status: 500 },
    );
  }
}
