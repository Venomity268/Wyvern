import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/index";
import { canViewConnection } from "@/lib/auth/access";
import { resolveSshConnection, connectSshClient } from "@/lib/bridges/ssh-connect";
import type { Client } from "ssh2";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function execCommand(
  client: Client,
  cmd: string,
  password?: string
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
      stream.on("close", async (code: number | null) => {
        const hasPermissionError =
          code !== 0 &&
          (stderr.toLowerCase().includes("permission denied") ||
            stderr.toLowerCase().includes("connect to the docker daemon socket"));

        if (hasPermissionError && password) {
          try {
            const sudoCmd = `sudo -S -p "" ${cmd}`;
            const sudoResult = await new Promise<{ stdout: string; stderr: string; code: number | null }>((sResolve, sReject) => {
              client.exec(sudoCmd, (sErr, sStream) => {
                if (sErr) return sReject(sErr);
                let sStdout = "";
                let sStderr = "";
                sStream.on("data", (chunk: Buffer) => {
                  sStdout += chunk.toString("utf8");
                });
                sStream.stderr.on("data", (chunk: Buffer) => {
                  sStderr += chunk.toString("utf8");
                });
                sStream.on("close", (sCode: number | null) => {
                  sResolve({ stdout: sStdout, stderr: sStderr, code: sCode });
                });
                sStream.write(password + "\n");
              });
            });
            resolve(sudoResult);
          } catch (sudoErr) {
            reject(sudoErr);
          }
        } else {
          resolve({ stdout, stderr, code });
        }
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

    const resolved = resolveSshConnection(user, id);
    if ("error" in resolved) {
      return NextResponse.json(
        { error: resolved.error, needsAuth: resolved.needsAuth },
        { status: resolved.needsAuth ? 400 : 403 }
      );
    }

    return new Promise<Response>((resolve) => {
      connectSshClient(
        resolved,
        async (client) => {
          try {
            // Run docker ps -a with custom JSON layout
            const psResult = await execCommand(
              client,
              `docker ps -a --format '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","state":"{{.State}}","status":"{{.Status}}","ports":"{{.Ports}}"}'`,
              resolved.password
            );

            if (psResult.code !== 0 && !psResult.stdout.trim()) {
              client.end();
              resolve(
                NextResponse.json(
                  { error: psResult.stderr.trim() || "Docker command failed or Docker is not installed" },
                  { status: 500 }
                )
              );
              return;
            }

            const containers = psResult.stdout
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                try {
                  return JSON.parse(line);
                } catch {
                  return null;
                }
              })
              .filter(Boolean);

            // Run docker stats --no-stream for active resource metrics (swallow error if none running)
            const statsResult = await execCommand(
              client,
              `docker stats --no-stream --format '{"id":"{{.ID}}","cpu":"{{.CPUPerc}}","mem":"{{.MemUsage}}","mem_perc":"{{.MemPerc}}","net":"{{.NetIO}}","block":"{{.BlockIO}}"}'`,
              resolved.password
            ).catch(() => ({ stdout: "", stderr: "", code: 1 }));

            const statsMap = new Map<string, any>();
            if (statsResult.code === 0 && statsResult.stdout.trim()) {
              statsResult.stdout
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .forEach((line) => {
                  try {
                    const parsed = JSON.parse(line);
                    statsMap.set(parsed.id, parsed);
                  } catch {}
                });
            }

            const merged = containers.map((c: any) => {
              const stats = statsMap.get(c.id);
              return {
                ...c,
                cpu: stats?.cpu || "0.0%",
                memory: stats?.mem || "N/A",
                mem_perc: stats?.mem_perc || "0.0%",
                net: stats?.net || "N/A",
                block: stats?.block || "N/A",
              };
            });

            client.end();
            resolve(NextResponse.json({ containers: merged }));
          } catch (err) {
            client.end();
            resolve(
              NextResponse.json(
                { error: err instanceof Error ? err.message : "Docker command execution failed" },
                { status: 500 }
              )
            );
          }
        },
        (err) => {
          resolve(
            NextResponse.json(
              { error: err.message || "Failed to establish SSH connection for Docker stats" },
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

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const { action, containerId } = await request.json();

    if (!action || !containerId) {
      return NextResponse.json({ error: "Action and containerId required" }, { status: 400 });
    }

    if (!["start", "stop", "restart", "logs"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const db = getDb();
    const connection = db.prepare("SELECT * FROM connections WHERE id = ?").get(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (!canViewConnection(user, connection as any)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const resolved = resolveSshConnection(user, id);
    if ("error" in resolved) {
      return NextResponse.json(
        { error: resolved.error, needsAuth: resolved.needsAuth },
        { status: resolved.needsAuth ? 400 : 403 }
      );
    }

    return new Promise<Response>((resolve) => {
      connectSshClient(
        resolved,
        async (client) => {
          try {
            let cmd = "";
            if (action === "start") {
              cmd = `docker start ${containerId}`;
            } else if (action === "stop") {
              cmd = `docker stop ${containerId}`;
            } else if (action === "restart") {
              cmd = `docker restart ${containerId}`;
            } else if (action === "logs") {
              cmd = `docker logs --tail 200 ${containerId}`;
            }

            const result = await execCommand(client, cmd, resolved.password);
            client.end();

            if (result.code !== 0) {
              resolve(
                NextResponse.json(
                  { error: result.stderr.trim() || `Docker command ${action} failed` },
                  { status: 500 }
                )
              );
              return;
            }

            resolve(NextResponse.json({ success: true, output: result.stdout }));
          } catch (err) {
            client.end();
            resolve(
              NextResponse.json(
                { error: err instanceof Error ? err.message : "Docker command execution failed" },
                { status: 500 }
              )
            );
          }
        },
        (err) => {
          resolve(
            NextResponse.json(
              { error: err.message || "Failed to establish SSH connection for Docker control" },
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
