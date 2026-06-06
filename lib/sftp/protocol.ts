export interface SftpEntryAttrs {
  size: number;
  mode: number;
  isDirectory: boolean;
  isSymlink?: boolean;
  mtime?: number;
}

export interface SftpEntry {
  filename: string;
  longname?: string;
  attrs: SftpEntryAttrs;
}

export interface SftpConnectParams {
  connectionId?: string;
  quickSessionId?: string;
  username?: string;
  password?: string;
  privateKey?: string;
}

export interface ReadTextResult {
  content: string;
  encoding: "utf8" | "base64";
  size: number;
  truncated?: boolean;
  tooLarge?: boolean;
}

export const SFTP_MAX_EDIT_BYTES = 10 * 1024 * 1024;
export const SFTP_WARN_BYTES = 50 * 1024 * 1024;

export type SftpRequestType =
  | "list"
  | "stat"
  | "realpath"
  | "readlink"
  | "read-text"
  | "write-text"
  | "get"
  | "put-start"
  | "put-chunk"
  | "put-end"
  | "mkdir"
  | "rm"
  | "rmdir"
  | "rename"
  | "chmod"
  | "set-sudo-password"
  | "exec";

export type SftpResponseType =
  | "ready"
  | "list-result"
  | "stat-result"
  | "realpath-result"
  | "readlink-result"
  | "read-text-result"
  | "write-text-done"
  | "get-chunk"
  | "get-done"
  | "put-ready"
  | "put-ack"
  | "put-done"
  | "ok"
  | "exec-result"
  | "error";

export function isPermissionError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("permission denied") ||
    lower.includes("eacces") ||
    lower.includes("access denied")
  );
}

export function modeToOctal(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, "0");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export function joinRemotePath(dir: string, name: string): string {
  if (dir === "." || dir === "") return name;
  if (dir.endsWith("/")) return `${dir}${name}`;
  return `${dir}/${name}`;
}

export function parentPath(path: string): string {
  if (path === "/" || path === ".") return "/";
  const parts = path.replace(/\/+$/, "").split("/");
  parts.pop();
  return parts.length === 0 ? "/" : parts.join("/");
}

export function fileKind(filename: string): "text" | "image" | "video" | "audio" | "pdf" | "markdown" | "binary" {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const base = filename.toLowerCase();
  if (["md", "markdown", "mdown", "mkdn"].includes(ext)) return "markdown";
  if (["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "ico", "tiff"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "avi", "mkv", "wmv", "flv", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "aac", "flac", "m4a", "wma"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  const textExts = [
    "txt", "log", "json", "xml", "yaml", "yml", "toml", "ini", "conf", "cfg",
    "sh", "bash", "zsh", "js", "jsx", "ts", "tsx", "py", "java", "cpp", "c", "h",
    "cs", "php", "rb", "go", "rs", "html", "css", "scss", "less", "sql", "vue",
    "svelte", "env", "dockerfile", "gitignore", "properties",
  ];
  if (textExts.includes(ext) || ["dockerfile", "makefile", "gemfile", "rakefile"].includes(base)) {
    return "text";
  }
  const binaryExts = [
    "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "exe", "dll", "so", "dylib", "bin", "iso",
  ];
  if (binaryExts.includes(ext)) return "binary";
  return "text";
}
