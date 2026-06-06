"use client";

import { useEffect, useRef } from "react";
import type { SftpEntry } from "@/lib/sftp/protocol";
import { fileKind } from "@/lib/sftp/protocol";

export interface ContextMenuAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface FileContextMenuProps {
  x: number;
  y: number;
  entry: SftpEntry | null;
  multiCount: number;
  onClose: () => void;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onProperties: () => void;
  onExtract?: () => void;
  onCompress?: () => void;
}

export function FileContextMenu({
  x,
  y,
  entry,
  multiCount,
  onClose,
  onOpen,
  onDownload,
  onRename,
  onDelete,
  onProperties,
  onExtract,
  onCompress,
}: FileContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const isFile = entry && !entry.attrs.isDirectory;
  const isArchive =
    entry &&
    isFile &&
    [".tar.gz", ".tgz", ".zip", ".tar", ".gz", ".bz2", ".xz"].some((ext) =>
      entry.filename.toLowerCase().endsWith(ext),
    );

  const items: ContextMenuAction[] = [];
  if (multiCount <= 1 && entry) {
    if (entry.attrs.isDirectory || !entry.attrs.isSymlink) {
      items.push({ label: entry.attrs.isDirectory ? "Open" : "Open", onClick: onOpen });
    }
    if (isFile) {
      items.push({ label: "Download", onClick: onDownload });
    }
    items.push({ label: "Rename", onClick: onRename });
    items.push({ label: "Properties", onClick: onProperties });
    if (isArchive && onExtract) {
      items.push({ label: "Extract here", onClick: onExtract });
    }
  }
  if (multiCount > 0 && onCompress) {
    items.push({ label: "Compress…", onClick: onCompress });
  }
  items.push({
    label: multiCount > 1 ? `Delete ${multiCount} items` : "Delete",
    onClick: onDelete,
    destructive: true,
  });

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-800 disabled:opacity-50 ${
            item.destructive ? "text-red-400" : "text-zinc-200"
          }`}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function isArchiveFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    fileKind(filename) === "binary" &&
    (lower.endsWith(".tar.gz") ||
      lower.endsWith(".tgz") ||
      lower.endsWith(".zip") ||
      lower.endsWith(".tar") ||
      lower.endsWith(".gz") ||
      lower.endsWith(".bz2") ||
      lower.endsWith(".xz"))
  );
}
