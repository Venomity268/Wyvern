import type { Client } from "ssh2";
import { isPermissionError } from "../sftp/protocol";

export function shellQuote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

export function runSshExec(
  client: Client,
  command: string,
  sudoPassword?: string | null,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let stdout = "";
      let stderr = "";
      stream.on("data", (d: Buffer) => {
        stdout += d.toString("utf8");
      });
      stream.stderr.on("data", (d: Buffer) => {
        stderr += d.toString("utf8");
      });
      stream.on("close", (code: number) => {
        resolve({ stdout, stderr, code: code ?? 0 });
      });
    });
  });
}

export async function execWithOptionalSudo(
  client: Client,
  command: string,
  sudoPassword: string | null | undefined,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const result = await runSshExec(client, command, sudoPassword);
  if (result.code === 0) return result;

  if (sudoPassword && isPermissionError(result.stderr || result.stdout)) {
    const sudoCmd = `echo ${shellQuote(sudoPassword)} | sudo -S -p '' bash -c ${shellQuote(command)}`;
    return runSshExec(client, sudoCmd, sudoPassword);
  }

  return result;
}

export async function sudoRm(
  client: Client,
  path: string,
  isDir: boolean,
  sudoPassword?: string | null,
): Promise<void> {
  const cmd = isDir ? `rm -rf ${shellQuote(path)}` : `rm -f ${shellQuote(path)}`;
  const result = await execWithOptionalSudo(client, cmd, sudoPassword);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "Delete failed");
  }
}

export async function sudoMkdir(
  client: Client,
  path: string,
  sudoPassword?: string | null,
): Promise<void> {
  const result = await execWithOptionalSudo(
    client,
    `mkdir -p ${shellQuote(path)}`,
    sudoPassword,
  );
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "mkdir failed");
  }
}

export async function sudoRename(
  client: Client,
  oldPath: string,
  newPath: string,
  sudoPassword?: string | null,
): Promise<void> {
  const result = await execWithOptionalSudo(
    client,
    `mv ${shellQuote(oldPath)} ${shellQuote(newPath)}`,
    sudoPassword,
  );
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "Rename failed");
  }
}

export async function sudoChmod(
  client: Client,
  path: string,
  mode: string,
  sudoPassword?: string | null,
): Promise<void> {
  const result = await execWithOptionalSudo(
    client,
    `chmod ${mode} ${shellQuote(path)}`,
    sudoPassword,
  );
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "chmod failed");
  }
}

export async function sudoWriteText(
  client: Client,
  path: string,
  content: string,
  sudoPassword?: string | null,
): Promise<void> {
  const tmp = `/tmp/wterm-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const b64 = Buffer.from(content, "utf8").toString("base64");
  const chunkSize = 48000;
  let writeCmd = `base64 -d > ${shellQuote(tmp)} << 'WTERM_EOF'\n`;
  for (let i = 0; i < b64.length; i += chunkSize) {
    writeCmd += `${b64.slice(i, i + chunkSize)}\n`;
  }
  writeCmd += `WTERM_EOF\nmv ${shellQuote(tmp)} ${shellQuote(path)}`;
  const result = await execWithOptionalSudo(client, writeCmd, sudoPassword);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "Write failed");
  }
}

export async function compressPaths(
  client: Client,
  cwd: string,
  names: string[],
  archiveName: string,
  sudoPassword?: string | null,
): Promise<void> {
  const quoted = names.map((n) => shellQuote(n)).join(" ");
  const archive = shellQuote(joinRemote(cwd, archiveName));
  const cmd = `cd ${shellQuote(cwd)} && tar czf ${archive} ${quoted}`;
  const result = await execWithOptionalSudo(client, cmd, sudoPassword);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "Compress failed");
  }
}

export async function extractArchive(
  client: Client,
  cwd: string,
  archivePath: string,
  sudoPassword?: string | null,
): Promise<void> {
  const lower = archivePath.toLowerCase();
  let cmd: string;
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
    cmd = `cd ${shellQuote(cwd)} && tar xzf ${shellQuote(archivePath)}`;
  } else if (lower.endsWith(".zip")) {
    cmd = `cd ${shellQuote(cwd)} && unzip -o ${shellQuote(archivePath)}`;
  } else if (lower.endsWith(".tar")) {
    cmd = `cd ${shellQuote(cwd)} && tar xf ${shellQuote(archivePath)}`;
  } else {
    throw new Error("Unsupported archive format");
  }
  const result = await execWithOptionalSudo(client, cmd, sudoPassword);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "Extract failed");
  }
}

function joinRemote(dir: string, name: string): string {
  if (dir === "/" || dir === "") return `/${name}`;
  if (dir.endsWith("/")) return `${dir}${name}`;
  return `${dir}/${name}`;
}
