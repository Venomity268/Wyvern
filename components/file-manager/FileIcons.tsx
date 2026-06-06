import {
  Archive,
  File,
  FileCode,
  FileImage,
  FileText,
  Folder,
  Link2,
} from "lucide-react";
import type { SftpEntry } from "@/lib/sftp/protocol";
import { fileKind } from "@/lib/sftp/protocol";

interface FileIconProps {
  entry: SftpEntry;
  className?: string;
}

export function FileEntryIcon({ entry, className = "h-4 w-4 shrink-0" }: FileIconProps) {
  if (entry.attrs.isDirectory) {
    return <Folder className={`${className} text-amber-400`} />;
  }
  if (entry.attrs.isSymlink) {
    return <Link2 className={`${className} text-blue-400`} />;
  }
  const kind = fileKind(entry.filename);
  switch (kind) {
    case "image":
      return <FileImage className={`${className} text-emerald-400`} />;
    case "text":
    case "markdown":
      return <FileCode className={`${className} text-sky-400`} />;
    case "binary":
      return <Archive className={`${className} text-orange-400`} />;
    default:
      return <File className={`${className} text-zinc-500`} />;
  }
}

export function FileKindIcon({ filename, className = "h-4 w-4" }: { filename: string; className?: string }) {
  const kind = fileKind(filename);
  switch (kind) {
    case "image":
      return <FileImage className={`${className} text-emerald-400`} />;
    case "markdown":
    case "text":
      return <FileText className={`${className} text-sky-400`} />;
    case "binary":
      return <Archive className={`${className} text-orange-400`} />;
    default:
      return <File className={`${className} text-zinc-500`} />;
  }
}
