"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import type { SftpEntry } from "@/lib/sftp/protocol";
import { FileContextMenu, isArchiveFile } from "./FileContextMenu";
import { FileEntryIcon } from "./FileIcons";
import { FileToolbar } from "./FileToolbar";
import { PermissionsDialog } from "./PermissionsDialog";
import type { FileManagerState } from "./hooks/useFileManager";

interface FileBrowserProps {
  fm: FileManagerState;
  onClose?: () => void;
}

function formatDate(mtime?: number) {
  if (!mtime) return "—";
  return new Date(mtime * 1000).toLocaleString();
}

export function FileBrowser({ fm, onClose }: FileBrowserProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: SftpEntry | null } | null>(null);
  const [renameTarget, setRenameTarget] = useState<SftpEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [propsTarget, setPropsTarget] = useState<SftpEntry | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleContextMenu = (e: React.MouseEvent, entry: SftpEntry | null) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const selectedName = [...fm.selected][0];
      const entry = fm.entries.find((en) => en.filename === selectedName);
      if (e.key === "Enter" && entry) {
        void fm.openEntry(entry);
      }
      if (e.key === "Delete" && fm.selected.size) {
        void fm.deleteSelected();
      }
      if (e.key === "F2" && entry) {
        setRenameTarget(entry);
        setRenameValue(entry.filename);
      }
    },
    [fm],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) {
        void fm.uploadFiles(e.dataTransfer.files);
      }
    },
    [fm],
  );

  const breadcrumbParts = fm.breadcrumbs;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-zinc-950"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <FileToolbar
        fm={fm}
        onClose={onClose}
        onUploadClick={() => fileInputRef.current?.click()}
        onNewFolder={() => {
          const name = prompt("New folder name:");
          if (name) void fm.mkdir(name);
        }}
        onNewFile={() => {
          const name = prompt("New file name:");
          if (name) void fm.createFile(name);
        }}
      />

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1 text-xs text-zinc-400">
        <button type="button" className="hover:text-zinc-200" onClick={() => void fm.navigateTo("/")}>
          /
        </button>
        {breadcrumbParts.map((part, i) => (
          <span key={part} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <button
              type="button"
              className="max-w-[120px] truncate hover:text-zinc-200"
              onClick={() => void fm.navigateTo(part)}
            >
              {part.split("/").pop() || "/"}
            </button>
          </span>
        ))}
      </div>

      {fm.progress && (
        <p className="shrink-0 px-2 py-1 text-xs text-zinc-400">{fm.progress}</p>
      )}
      {fm.error && (
        <p className="shrink-0 px-2 py-1 text-xs text-red-400">{fm.error}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void fm.uploadFiles(e.target.files || []);
          e.target.value = "";
        }}
      />

      <div
        className={`min-h-0 flex-1 overflow-auto ${dragOver ? "ring-2 ring-inset ring-sky-600/50" : ""}`}
      >
        {fm.loading && fm.entries.length === 0 && (
          <div className="flex items-center gap-2 p-3 text-xs text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {!fm.loading && fm.entries.length === 0 && (
          <p className="p-3 text-xs text-zinc-500">This folder is empty.</p>
        )}

        {fm.viewMode === "list" ? (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-500">
              <tr>
                <th className="px-2 py-1 text-left font-normal">
                  <button type="button" onClick={() => fm.toggleSort("name")}>
                    Name {fm.sortField === "name" ? (fm.sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="hidden px-2 py-1 text-right font-normal sm:table-cell">
                  <button type="button" onClick={() => fm.toggleSort("size")}>
                    Size {fm.sortField === "size" ? (fm.sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="hidden px-2 py-1 text-right font-normal md:table-cell">
                  <button type="button" onClick={() => fm.toggleSort("modified")}>
                    Modified {fm.sortField === "modified" ? (fm.sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="hidden px-2 py-1 text-right font-normal lg:table-cell">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {fm.entries.map((entry) => {
                const isSelected = fm.selected.has(entry.filename);
                return (
                  <tr
                    key={entry.filename}
                    className={`cursor-pointer hover:bg-zinc-800/40 ${isSelected ? "bg-zinc-800/60" : ""}`}
                    onClick={(e) => fm.toggleSelect(entry.filename, e.ctrlKey || e.metaKey)}
                    onDoubleClick={() => void fm.openEntry(entry)}
                    onContextMenu={(e) => handleContextMenu(e, entry)}
                  >
                    <td className="px-2 py-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileEntryIcon entry={entry} />
                        <span className="truncate text-zinc-200">{entry.filename}</span>
                      </div>
                    </td>
                    <td className="hidden px-2 py-1.5 text-right text-xs text-zinc-500 sm:table-cell">
                      {entry.attrs.isDirectory ? "—" : fm.formatFileSize(entry.attrs.size)}
                    </td>
                    <td className="hidden px-2 py-1.5 text-right text-xs text-zinc-500 md:table-cell">
                      {formatDate(entry.attrs.mtime)}
                    </td>
                    <td className="hidden px-2 py-1.5 text-right font-mono text-xs text-zinc-500 lg:table-cell">
                      {fm.modeToOctal(entry.attrs.mode)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2 p-2">
            {fm.entries.map((entry) => {
              const isSelected = fm.selected.has(entry.filename);
              return (
                <button
                  key={entry.filename}
                  type="button"
                  className={`flex flex-col items-center gap-1 rounded border p-2 text-center hover:bg-zinc-800/40 ${
                    isSelected ? "border-sky-600 bg-zinc-800/60" : "border-transparent"
                  }`}
                  onClick={(e) => fm.toggleSelect(entry.filename, e.ctrlKey || e.metaKey)}
                  onDoubleClick={() => void fm.openEntry(entry)}
                  onContextMenu={(e) => handleContextMenu(e, entry)}
                >
                  <FileEntryIcon entry={entry} className="h-8 w-8" />
                  <span className="line-clamp-2 w-full text-xs text-zinc-200">{entry.filename}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          multiCount={fm.selected.size || (contextMenu.entry ? 1 : 0)}
          onClose={() => setContextMenu(null)}
          onOpen={() => contextMenu.entry && void fm.openEntry(contextMenu.entry)}
          onDownload={() => contextMenu.entry && void fm.downloadEntry(contextMenu.entry)}
          onRename={() => {
            if (contextMenu.entry) {
              setRenameTarget(contextMenu.entry);
              setRenameValue(contextMenu.entry.filename);
            }
          }}
          onDelete={() => {
            const names =
              fm.selected.size > 0
                ? [...fm.selected]
                : contextMenu.entry
                  ? [contextMenu.entry.filename]
                  : [];
            void fm.deleteEntries(names);
          }}
          onProperties={() => contextMenu.entry && setPropsTarget(contextMenu.entry)}
          onExtract={
            contextMenu.entry && isArchiveFile(contextMenu.entry.filename)
              ? () => void fm.extractArchive(contextMenu.entry!)
              : undefined
          }
          onCompress={
            fm.selected.size > 0
              ? () => {
                  const name = prompt("Archive name (e.g. archive.tar.gz):", "archive.tar.gz");
                  if (name) void fm.compressSelected(name);
                }
              : undefined
          }
        />
      )}

      {renameTarget && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
          <form
            className="w-full max-w-xs space-y-2 rounded border border-zinc-700 bg-zinc-900 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void fm.renameEntry(renameTarget, renameValue);
              setRenameTarget(null);
            }}
          >
            <p className="text-sm text-zinc-200">Rename</p>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-zinc-400" onClick={() => setRenameTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="text-sm text-sky-400">
                OK
              </button>
            </div>
          </form>
        </div>
      )}

      {propsTarget && (
        <PermissionsDialog
          entry={propsTarget}
          onSave={(mode) => {
            void fm.chmod(propsTarget, mode);
            setPropsTarget(null);
          }}
          onClose={() => setPropsTarget(null)}
        />
      )}
    </div>
  );
}
