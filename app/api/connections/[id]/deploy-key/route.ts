import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { canViewConnection } from "@/lib/auth/access";
import { resolveSshConnection, connectSshClient } from "@/lib/bridges/ssh-connect";
import { getOrCreateBastionKeypair } from "@/lib/ssh/ssh-keys";
import type { Client } from "ssh2";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function execCommand(
  client: Client,
  cmd: string
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    client.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      stream.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      stream.on("close", (code: number | null) => {
        resolve({ stdout, stderr, code });
      });
    });
  });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSession();
    const { id } = await params;

    const db = getDb();
    const connection = db.prepare("SELECT * FROM connections WHERE id = ?").get(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (!canViewConnection(user, connection as any)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { publicKey } = getOrCreateBastionKeypair();
    return NextResponse.json({ publicKey });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const customPassword = body.password;

    const db = getDb();
    const connection = db.prepare("SELECT * FROM connections WHERE id = ?").get(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (!canViewConnection(user, connection as any)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const resolved = resolveSshConnection(user, id, customPassword ? { password: customPassword } : undefined);
    if ("error" in resolved) {
      return NextResponse.json(
        { error: resolved.error, needsAuth: resolved.needsAuth },
        { status: resolved.needsAuth ? 400 : 403 }
      );
    }

    const { publicKey } = getOrCreateBastionKeypair();

    return new Promise<Response>((resolve) => {
      connectSshClient(
        resolved,
        async (client) => {
          try {
            const deployScript = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && (grep -qFx "${publicKey}" ~/.ssh/authorized_keys || echo "${publicKey}" >> ~/.ssh/authorized_keys)`;
            
            const result = await execCommand(client, deployScript);
            client.end();

            if (result.code !== 0) {
              resolve(
                NextResponse.json(
                  { error: result.stderr.trim() || `Deployment script failed with code ${result.code}` },
                  { status: 500 }
                )
              );
              return;
            }

            resolve(NextResponse.json({ success: true, publicKey }));
          } catch (err) {
            client.end();
            resolve(
              NextResponse.json(
                { error: err instanceof Error ? err.message : "SSH Key deployment command failed" },
                { status: 500 }
              )
            );
          }
        },
        (err) => {
          resolve(
            NextResponse.json(
              { error: err.message || "Failed to establish SSH connection for key deployment" },
              { status: 500 }
            )
          );
        }
      );
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
