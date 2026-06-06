import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireSession } from "@/lib/auth/session";
import { getDb, logAudit } from "@/lib/db/index";
import {
  attachMethods,
  getMethodsForConnection,
  normalizeMethods,
  primaryMethod,
  resolveMethodCredentials,
  saveMethodsForConnection,
  type ConnectionMethodInput,
} from "@/lib/db/connection-methods";
import { attachHostInfoSummary } from "@/lib/db/host-info";
import { normalizeMacAddress } from "@/lib/wol";
import type { ConnectionProtocol } from "@/lib/protocols";
import {
  canEditConnection,
  canViewConnection,
  canViewWorkspace,
  canMoveToWorkspace,
  credentialInWorkspace,
} from "@/lib/auth/access";

function withMethods(connection: Record<string, unknown>) {
  const [enriched] = attachHostInfoSummary(getDb(), attachMethods([connection as { id: string }]));
  return enriched;
}

function parseMacAddress(value: unknown): string | null {
  if (value === undefined) return null;
  if (value === null || value === "") return null;
  const mac = normalizeMacAddress(String(value));
  if (!mac) throw new Error("Invalid MAC address format");
  return mac;
}

function parseWolBroadcast(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value).trim();
}

function parseMethods(
  body: Record<string, unknown>,
  existing?: { protocol: string; port: number; credential_id?: string | null },
) {
  const raw = body.methods as ConnectionMethodInput[] | undefined;
  const methods = normalizeMethods(
    raw,
    existing
      ? {
          protocol: existing.protocol as ConnectionProtocol,
          port: existing.port,
          credential_id: existing.credential_id,
        }
      : undefined,
  );
  if (methods.length === 0) {
    return { error: "At least one access method (SSH, VNC, or RDP) is required" };
  }
  return { methods };
}

function validateMethodCredentials(methods: ConnectionMethodInput[], workspaceId: string) {
  for (const m of methods) {
    if (m.credential_id && !credentialInWorkspace(m.credential_id, workspaceId)) {
      return {
        error: `Credential for ${m.protocol.toUpperCase()} must belong to the same workspace`,
      };
    }
  }
  return null;
}

function primaryCredentialId(methods: ConnectionMethodInput[]) {
  return primaryMethod(methods)?.credential_id ?? null;
}

function syncLegacyColumns(
  id: string,
  methods: ConnectionMethodInput[],
  fields: {
    name?: string;
    hostname?: string;
    username?: string | null;
    workspace_id?: string;
  },
) {
  const primary = primaryMethod(methods)!;
  getDb()
    .prepare(
      `UPDATE connections SET name = ?, hostname = ?, port = ?, protocol = ?, username = ?,
       credential_id = ?, workspace_id = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(
      fields.name,
      fields.hostname,
      primary.port,
      primary.protocol,
      fields.username ?? null,
      primaryCredentialId(methods),
      fields.workspace_id,
      id,
    );
}

export async function GET(request: NextRequest) {
  const user = await requireSession();
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");

  let connections: Record<string, unknown>[];

  if (workspaceId) {
    if (!canViewWorkspace(user, workspaceId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    connections = getDb()
      .prepare("SELECT * FROM connections WHERE workspace_id = ? ORDER BY name ASC")
      .all(workspaceId) as Record<string, unknown>[];
  } else if (user.role === "admin") {
    connections = getDb()
      .prepare("SELECT * FROM connections ORDER BY name ASC")
      .all() as Record<string, unknown>[];
  } else {
    connections = getDb()
      .prepare(
        `SELECT c.* FROM connections c
         INNER JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
         WHERE wm.user_id = ?
         ORDER BY c.name ASC`,
      )
      .all(user.id) as Record<string, unknown>[];
  }

  return NextResponse.json({
    connections: attachHostInfoSummary(getDb(), attachMethods(connections as { id: string }[])),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireSession();
  const body = await request.json();

  if (body.duplicateFromId) {
    const source = getDb()
      .prepare("SELECT * FROM connections WHERE id = ?")
      .get(body.duplicateFromId) as {
      id: string;
      name: string;
      hostname: string;
      port: number;
      protocol: string;
      username: string | null;
      credential_id: string | null;
      workspace_id: string;
    } | undefined;

    if (!source) {
      return NextResponse.json({ error: "Source connection not found" }, { status: 404 });
    }

    if (!canViewConnection(user, source as Parameters<typeof canViewConnection>[1])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const workspaceId = (body.workspace_id as string) || source.workspace_id;
    if (!canMoveToWorkspace(user, workspaceId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const credId =
      source.credential_id && credentialInWorkspace(source.credential_id, workspaceId)
        ? source.credential_id
        : null;

    let methods: ConnectionMethodInput[];
    if (body.methods) {
      const parsed = parseMethods(body, source);
      if ("error" in parsed) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      methods = resolveMethodCredentials(parsed.methods, workspaceId, credentialInWorkspace);
    } else {
      methods = resolveMethodCredentials(
        getMethodsForConnection(getDb(), source.id).map((m) => ({
          protocol: m.protocol,
          port: m.port,
          credential_id: m.credential_id,
        })),
        workspaceId,
        credentialInWorkspace,
      );
    }

    const credError = validateMethodCredentials(methods, workspaceId);
    if (credError) {
      return NextResponse.json({ error: credError.error }, { status: 400 });
    }

    const primary = primaryMethod(methods)!;
    const id = uuidv4();
    const name = (body.name as string) || `${source.name} (copy)`;

    getDb()
      .prepare(
        `INSERT INTO connections (id, workspace_id, owner_id, name, hostname, port, protocol, username, credential_id, mac_address, wol_broadcast)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        workspaceId,
        user.id,
        name,
        source.hostname,
        primary.port,
        primary.protocol,
        source.username,
        primaryCredentialId(methods) ?? credId,
        (source as { mac_address?: string | null }).mac_address ?? null,
        (source as { wol_broadcast?: string | null }).wol_broadcast ?? null,
      );

    saveMethodsForConnection(getDb(), id, methods);

    logAudit(user.id, "duplicate", "connection", {
      id,
      source_id: body.duplicateFromId,
      workspace_id: workspaceId,
    });

    return NextResponse.json({ connection: withMethods(getDb().prepare("SELECT * FROM connections WHERE id = ?").get(id) as Record<string, unknown>) }, { status: 201 });
  }

  const workspaceId = body.workspace_id as string;

  if (!workspaceId || !canMoveToWorkspace(user, workspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = parseMethods(body, {
    protocol: (body.protocol as ConnectionProtocol) || "ssh",
    port: body.port as number,
    credential_id: (body.credential_id as string | null | undefined) ?? null,
  });
  if ("error" in parsed && !body.methods) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  let methods = parsed.methods!;
  methods = resolveMethodCredentials(methods, workspaceId, credentialInWorkspace);

  const credError = validateMethodCredentials(methods, workspaceId);
  if (credError) {
    return NextResponse.json({ error: credError.error }, { status: 400 });
  }

  const primary = primaryMethod(methods)!;
  const id = uuidv4();
  let macAddress: string | null = null;
  let wolBroadcast: string | null = null;
  try {
    macAddress = parseMacAddress(body.mac_address);
    wolBroadcast = parseWolBroadcast(body.wol_broadcast);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid wake settings" },
      { status: 400 },
    );
  }

  getDb()
    .prepare(
      `INSERT INTO connections (id, workspace_id, owner_id, name, hostname, port, protocol, username, credential_id, mac_address, wol_broadcast)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      workspaceId,
      user.id,
      body.name,
      body.hostname,
      primary.port,
      primary.protocol,
      body.username || null,
      primaryCredentialId(methods),
      macAddress,
      wolBroadcast,
    );

  saveMethodsForConnection(getDb(), id, methods);

  logAudit(user.id, "create", "connection", { id, name: body.name, workspace_id: workspaceId });

  return NextResponse.json(
    { connection: withMethods(getDb().prepare("SELECT * FROM connections WHERE id = ?").get(id) as Record<string, unknown>) },
    { status: 201 },
  );
}

export async function PATCH(request: NextRequest) {
  const user = await requireSession();
  const body = await request.json();
  const { id, ...updates } = body;

  const existing = getDb().prepare("SELECT * FROM connections WHERE id = ?").get(id) as ({
    id: string;
    name: string;
    hostname: string;
    port: number;
    protocol: ConnectionProtocol;
    username: string | null;
    credential_id: string | null;
    workspace_id: string;
    owner_id: string | null;
    mac_address: string | null;
    wol_broadcast: string | null;
  }) | undefined;

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canEditConnection(user, existing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targetWorkspaceId = updates.workspace_id as string | undefined;
  const workspaceId = targetWorkspaceId ?? existing.workspace_id;

  if (targetWorkspaceId && !canMoveToWorkspace(user, targetWorkspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = updates.name ?? existing.name;
  const hostname = updates.hostname ?? existing.hostname;
  const username = updates.username ?? existing.username ?? null;

  let methods: ConnectionMethodInput[];
  if (updates.methods) {
    const parsed = parseMethods({ methods: updates.methods }, existing);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    methods = resolveMethodCredentials(parsed.methods, workspaceId, credentialInWorkspace);
  } else {
    methods = resolveMethodCredentials(
      getMethodsForConnection(getDb(), id).map((m) => ({
        protocol: m.protocol,
        port: m.port,
        credential_id: m.credential_id,
      })),
      workspaceId,
      credentialInWorkspace,
    );
  }

  const credError = validateMethodCredentials(methods, workspaceId);
  if (credError) {
    return NextResponse.json({ error: credError.error }, { status: 400 });
  }

  syncLegacyColumns(id, methods, {
    name,
    hostname,
    username,
    workspace_id: workspaceId,
  });

  let macAddress: string | null | undefined;
  let wolBroadcast: string | null | undefined;
  try {
    if ("mac_address" in updates) macAddress = parseMacAddress(updates.mac_address);
    if ("wol_broadcast" in updates) wolBroadcast = parseWolBroadcast(updates.wol_broadcast);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid wake settings" },
      { status: 400 },
    );
  }

  if ("mac_address" in updates || "wol_broadcast" in updates) {
    getDb()
      .prepare(
        `UPDATE connections SET mac_address = ?, wol_broadcast = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(
        "mac_address" in updates ? macAddress : existing.mac_address ?? null,
        "wol_broadcast" in updates ? wolBroadcast : (existing as { wol_broadcast?: string | null }).wol_broadcast ?? null,
        id,
      );
  }

  saveMethodsForConnection(getDb(), id, methods);

  if (targetWorkspaceId) {
    logAudit(user.id, "move", "connection", { id, workspace_id: targetWorkspaceId });
  } else {
    logAudit(user.id, "update", "connection", { id, name });
  }

  return NextResponse.json({
    connection: withMethods(getDb().prepare("SELECT * FROM connections WHERE id = ?").get(id) as Record<string, unknown>),
  });
}

export async function DELETE(request: NextRequest) {
  const user = await requireSession();
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = getDb().prepare("SELECT * FROM connections WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canEditConnection(user, existing as Parameters<typeof canEditConnection>[1])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  getDb().prepare("DELETE FROM connections WHERE id = ?").run(id);
  logAudit(user.id, "delete", "connection", { id });

  return NextResponse.json({ ok: true });
}
