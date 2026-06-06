import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { canViewConnection } from "@/lib/auth/access";
import { decryptSecret } from "@/lib/crypto/secrets";
import { encryptGuacToken } from "@/lib/guac/token";
import { getMethodPort, resolveGuacMethodCredential } from "@/lib/db/connection-methods";
import { resolveQuickGuac } from "@/lib/quick-connect";
import { defaultPort, type GuacProtocol } from "@/lib/protocols";
import { guacRdpConnectionSettings } from "@/lib/guac/rdp-settings";
import { resolveGuacdHostname } from "@/lib/guac/resolve-hostname";

async function withGuacdHostname(
  settings: Record<string, string | number | boolean>,
): Promise<Record<string, string | number | boolean>> {
  const hostname = settings.hostname;
  if (typeof hostname !== "string") return settings;
  const resolved = await resolveGuacdHostname(hostname);
  if (resolved === hostname) return settings;
  return { ...settings, hostname: resolved };
}

function guacDisplaySettings(width: number, height: number) {
  return {
    width,
    height,
    dpi: 96,
    "color-depth": 32,
    "resize-method": "display-update",
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    const body = await request.json();
    const {
      connectionId,
      quickSessionId,
      password: inlinePassword,
      username: inlineUsername,
      width,
      height,
      via,
    } = body;

    const displayWidth = width || 1280;
    const displayHeight = height || 720;

    if (quickSessionId) {
      const resolved = resolveQuickGuac(user, quickSessionId, {
        username: inlineUsername,
        password: inlinePassword,
      });

      if ("error" in resolved) {
        return NextResponse.json(
          { error: resolved.error, needsAuth: resolved.needsAuth },
          { status: resolved.needsAuth ? 400 : 404 },
        );
      }

      const settings: Record<string, string | number | boolean> =
        resolved.protocol === "rdp"
          ? guacRdpConnectionSettings(displayWidth, displayHeight, {
              hostname: resolved.hostname,
              port: resolved.port,
              username: resolved.username!,
              password: resolved.password!,
            })
          : {
              hostname: resolved.hostname,
              port: String(resolved.port),
              password: resolved.password!,
              ...guacDisplaySettings(displayWidth, displayHeight),
            };

      if (resolved.protocol === "vnc") {
        settings["clipboard-encoding"] = "UTF-8";
        if (resolved.username) {
          settings.username = resolved.username;
        }
      }

      const token = encryptGuacToken({
        connection: { type: resolved.protocol, settings: await withGuacdHostname(settings) },
        meta: {
          connectionId: null,
          quickSessionId: resolved.quickSessionId,
          userId: user.id,
          workspace_id: null,
          connectionName: resolved.label,
          hostname: resolved.hostname,
          protocol: resolved.protocol,
        },
      });

      return NextResponse.json({ token });
    }

    if (!connectionId) {
      return NextResponse.json({ error: "connectionId required" }, { status: 400 });
    }

    const connection = getDb()
      .prepare("SELECT * FROM connections WHERE id = ?")
      .get(connectionId) as {
      id: string;
      workspace_id: string;
      owner_id: string | null;
      name: string;
      hostname: string;
      port: number;
      protocol: string;
      username: string | null;
      credential_id: string | null;
    } | undefined;

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const requestedVia = (via as GuacProtocol | undefined) || undefined;
    const vncPort = getMethodPort(getDb(), connectionId, "vnc");
    const rdpPort = getMethodPort(getDb(), connectionId, "rdp");

    let protocol: GuacProtocol | null = null;
    if (requestedVia === "vnc" && vncPort !== null) protocol = "vnc";
    else if (requestedVia === "rdp" && rdpPort !== null) protocol = "rdp";
    else if (!requestedVia) {
      if (vncPort !== null && connection.protocol === "vnc") protocol = "vnc";
      else if (rdpPort !== null && connection.protocol === "rdp") protocol = "rdp";
      else if (vncPort !== null) protocol = "vnc";
      else if (rdpPort !== null) protocol = "rdp";
    }

    if (!protocol) {
      return NextResponse.json({ error: "VNC/RDP is not enabled for this connection" }, { status: 404 });
    }

    const port =
      (protocol === "vnc" ? vncPort : rdpPort) ?? connection.port ?? defaultPort(protocol);

    if (!canViewConnection(user, {
      ...connection,
      protocol: connection.protocol as "ssh" | "vnc" | "rdp",
      username: connection.username,
    })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let password = inlinePassword as string | undefined;
    let username = inlineUsername as string | undefined;

    const credentialId = resolveGuacMethodCredential(
      getDb(),
      connectionId,
      protocol,
      connection.credential_id,
    );

    if (credentialId) {
      const cred = getDb()
        .prepare(
          "SELECT username, encrypted_password FROM credentials WHERE id = ?",
        )
        .get(credentialId) as
        | { username: string | null; encrypted_password: string | null }
        | undefined;

      if (cred?.username && !username) {
        username = cred.username;
      }
      if (cred?.encrypted_password && !password) {
        password = decryptSecret(cred.encrypted_password);
      }
    }

    if (!username) {
      username = connection.username || undefined;
    }

    if (protocol === "rdp" && !username) {
      return NextResponse.json(
        { error: "RDP username required", needsAuth: true },
        { status: 400 },
      );
    }

    if (!password) {
      return NextResponse.json(
        {
          error: protocol === "rdp" ? "RDP password required" : "VNC password required",
          needsAuth: true,
        },
        { status: 400 },
      );
    }

    const settings: Record<string, string | number | boolean> =
      protocol === "rdp"
        ? guacRdpConnectionSettings(displayWidth, displayHeight, {
            hostname: connection.hostname,
            port,
            username: username!,
            password,
          })
        : {
            hostname: connection.hostname,
            port: String(port),
            password,
            ...guacDisplaySettings(displayWidth, displayHeight),
          };

    if (protocol === "vnc") {
      settings["clipboard-encoding"] = "UTF-8";
      if (username) {
        settings.username = username;
      }
    }

    const token = encryptGuacToken({
      connection: {
        type: protocol,
        settings: await withGuacdHostname(settings),
      },
      meta: {
        connectionId: connection.id,
        quickSessionId: null,
        userId: user.id,
        workspace_id: connection.workspace_id,
        connectionName: connection.name,
        hostname: connection.hostname,
        protocol,
      },
    });

    return NextResponse.json({ token });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[guac/token]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create token" },
      { status: 500 },
    );
  }
}
