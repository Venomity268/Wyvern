"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SftpEntry } from "@/lib/sftp/protocol";
import {
  fileKind,
  formatFileSize,
  joinRemotePath,
  modeToOctal,
  parentPath,
} from "@/lib/sftp/protocol";
import { useSftpClient, type SessionAuth } from "./useSftpClient";

export type ViewMode = "list" | "grid";
export type SortField = "name" | "size" | "modified";
export type SortDir = "asc" | "desc";

export interface OpenFile {
  path: string;
  name: string;
  kind: ReturnType<typeof fileKind>;
  size: number;
  mtime?: number;
}

const VIEW_MODE_KEY = "wterm-file-manager-view";

function loadViewMode(): ViewMode {
  if (typeof window === "undefined") return "list";
  return localStorage.getItem(VIEW_MODE_KEY) === "grid" ? "grid" : "list";
}

function saveViewMode(mode: ViewMode) {
  localStorage.setItem(VIEW_MODE_KEY, mode);
}

function sortEntries(entries: SftpEntry[], field: SortField, dir: SortDir): SftpEntry[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.attrs.isDirectory !== b.attrs.isDirectory) {
      return a.attrs.isDirectory ? -1 : 1;
    }
    if (field === "name") {
      return mult * a.filename.localeCompare(b.filename, undefined, { sensitivity: "base" });
    }
    if (field === "size") {
      return mult * ((a.attrs.size || 0) - (b.attrs.size || 0));
    }
    return mult * ((a.attrs.mtime || 0) - (b.attrs.mtime || 0));
  });
}

export function useFileManager(
  connectionId: string | undefined,
  quickSessionId: string | undefined,
  hasStoredCredential: boolean,
  sessionAuth?: SessionAuth | null,
) {
  const sftp = useSftpClient(connectionId, quickSessionId, hasStoredCredential, sessionAuth);
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewMode, setViewModeState] = useState<ViewMode>(loadViewMode);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [sudoPrompt, setSudoPrompt] = useState<(() => void) | null>(null);
  const [sudoResolver, setSudoResolver] = useState<((v: string | null) => void) | null>(null);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    saveViewMode(mode);
  }, []);

  const requestSudo = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      setSudoResolver(() => resolve);
      setSudoPrompt(() => () => {});
    });
  }, []);

  const resolveSudo = useCallback(
    (password: string | null) => {
      sudoResolver?.(password);
      setSudoResolver(null);
      setSudoPrompt(null);
    },
    [sudoResolver],
  );

  const withSudo = useCallback(
    <T,>(fn: () => Promise<T>) => sftp.withSudoRetry(fn, requestSudo),
    [sftp, requestSudo],
  );

  const refresh = useCallback(async () => {
    if (!sftp.ready) return;
    setLoading(true);
    sftp.setError("");
    try {
      const target = path || sftp.cwd;
      const res = await sftp.client.list(target);
      setPath(res.path);
      setEntries(res.entries.filter((e) => e.filename !== "." && e.filename !== ".."));
      setSelected(new Set());
    } catch (err) {
      sftp.setError(err instanceof Error ? err.message : "Failed to list directory");
    } finally {
      setLoading(false);
    }
  }, [path, sftp]);

  const navigateTo = useCallback(
    async (target: string) => {
      setLoading(true);
      try {
        const resolved = await sftp.client.realpath(target);
        setPath(resolved);
        const res = await sftp.client.list(resolved);
        setPath(res.path);
        setEntries(res.entries.filter((e) => e.filename !== "." && e.filename !== ".."));
        setSelected(new Set());
      } catch (err) {
        sftp.setError(err instanceof Error ? err.message : "Navigation failed");
      } finally {
        setLoading(false);
      }
    },
    [sftp],
  );

  const navigateRef = useRef(navigateTo);
  useEffect(() => {
    navigateRef.current = navigateTo;
  });

  useEffect(() => {
    if (sftp.ready) {
      const timeout = setTimeout(() => {
        void navigateRef.current(sftp.cwd);
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [sftp.ready, sftp.cwd]);

  const goUp = useCallback(() => {
    void navigateTo(parentPath(path || sftp.cwd));
  }, [navigateTo, path, sftp.cwd]);

  const openEntry = useCallback(
    async (entry: SftpEntry) => {
      const fullPath = joinRemotePath(path, entry.filename);
      if (entry.attrs.isDirectory || entry.attrs.isSymlink) {
        if (entry.attrs.isSymlink && !entry.attrs.isDirectory) {
          try {
            const target = await sftp.client.readlink(fullPath);
            const resolved = target.startsWith("/")
              ? target
              : joinRemotePath(parentPath(fullPath), target);
            void navigateTo(resolved);
          } catch {
            void navigateTo(fullPath);
          }
          return;
        }
        void navigateTo(fullPath);
        return;
      }
      setOpenFile({
        path: fullPath,
        name: entry.filename,
        kind: fileKind(entry.filename),
        size: entry.attrs.size,
        mtime: entry.attrs.mtime,
      });
    },
    [navigateTo, path, sftp.client],
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      for (const file of list) {
        const remotePath = joinRemotePath(path, file.name);
        setProgress(`Uploading ${file.name}…`);
        try {
          const buf = new Uint8Array(await file.arrayBuffer());
          await withSudo(() => sftp.client.upload(remotePath, buf));
        } catch (err) {
          sftp.setError(err instanceof Error ? err.message : "Upload failed");
          break;
        }
      }
      setProgress("");
      await refresh();
    },
    [path, refresh, sftp, withSudo],
  );

  const downloadEntry = useCallback(
    async (entry: SftpEntry) => {
      const remotePath = joinRemotePath(path, entry.filename);
      setProgress(`Downloading ${entry.filename}…`);
      try {
        const data = await sftp.client.download(remotePath);
        const blob = new Blob([new Uint8Array(data)]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = entry.filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        sftp.setError(err instanceof Error ? err.message : "Download failed");
      } finally {
        setProgress("");
      }
    },
    [path, sftp],
  );

  const deleteEntries = useCallback(
    async (names: string[]) => {
      if (!names.length) return;
      if (!confirm(`Delete ${names.length} item(s)?`)) return;
      for (const name of names) {
        const entry = entries.find((e) => e.filename === name);
        if (!entry) continue;
        const remotePath = joinRemotePath(path, name);
        try {
          await withSudo(() =>
            sftp.client.remove(remotePath, entry.attrs.isDirectory),
          );
        } catch (err) {
          sftp.setError(err instanceof Error ? err.message : "Delete failed");
          break;
        }
      }
      await refresh();
    },
    [entries, path, refresh, sftp, withSudo],
  );

  const deleteSelected = useCallback(async () => {
    await deleteEntries([...selected]);
  }, [deleteEntries, selected]);

  const renameEntry = useCallback(
    async (entry: SftpEntry, newName: string) => {
      if (!newName.trim() || newName === entry.filename) return;
      const oldPath = joinRemotePath(path, entry.filename);
      const newPath = joinRemotePath(path, newName.trim());
      try {
        await withSudo(() => sftp.client.rename(oldPath, newPath));
        await refresh();
      } catch (err) {
        sftp.setError(err instanceof Error ? err.message : "Rename failed");
      }
    },
    [path, refresh, sftp, withSudo],
  );

  const mkdir = useCallback(
    async (name: string) => {
      if (!name.trim()) return;
      const remotePath = joinRemotePath(path, name.trim());
      try {
        await withSudo(() => sftp.client.mkdir(remotePath));
        await refresh();
      } catch (err) {
        sftp.setError(err instanceof Error ? err.message : "Create folder failed");
      }
    },
    [path, refresh, sftp, withSudo],
  );

  const createFile = useCallback(
    async (name: string) => {
      if (!name.trim()) return;
      const remotePath = joinRemotePath(path, name.trim());
      try {
        await withSudo(() => sftp.client.writeText(remotePath, ""));
        await refresh();
        setOpenFile({
          path: remotePath,
          name: name.trim(),
          kind: fileKind(name.trim()),
          size: 0,
        });
      } catch (err) {
        sftp.setError(err instanceof Error ? err.message : "Create file failed");
      }
    },
    [path, refresh, sftp, withSudo],
  );

  const chmod = useCallback(
    async (entry: SftpEntry, mode: string) => {
      const remotePath = joinRemotePath(path, entry.filename);
      try {
        await withSudo(() => sftp.client.chmod(remotePath, mode));
        await refresh();
      } catch (err) {
        sftp.setError(err instanceof Error ? err.message : "chmod failed");
      }
    },
    [path, refresh, sftp, withSudo],
  );

  const compressSelected = useCallback(
    async (archiveName: string) => {
      const names = [...selected];
      if (!names.length) return;
      try {
        await withSudo(() => sftp.client.compress(path, names, archiveName));
        await refresh();
      } catch (err) {
        sftp.setError(err instanceof Error ? err.message : "Compress failed");
      }
    },
    [path, refresh, selected, sftp, withSudo],
  );

  const extractArchive = useCallback(
    async (entry: SftpEntry) => {
      const remotePath = joinRemotePath(path, entry.filename);
      try {
        await withSudo(() => sftp.client.extract(path, remotePath));
        await refresh();
      } catch (err) {
        sftp.setError(err instanceof Error ? err.message : "Extract failed");
      }
    },
    [path, refresh, sftp, withSudo],
  );

  const sortedEntries = useMemo(
    () => sortEntries(entries, sortField, sortDir),
    [entries, sortField, sortDir],
  );

  const breadcrumbs = useMemo(() => {
    const p = path || sftp.cwd || "/";
    if (p === "/") return ["/"];
    return p.split("/").filter(Boolean).reduce<string[]>((acc, part) => {
      const prev = acc.length ? acc[acc.length - 1] : "";
      acc.push(prev === "/" ? `/${part}` : `${prev}/${part}`);
      return acc;
    }, []);
  }, [path, sftp.cwd]);

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    },
    [sortField],
  );

  const toggleSelect = useCallback((name: string, multi?: boolean) => {
    setSelected((prev) => {
      const next = multi ? new Set(prev) : new Set<string>();
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(entries.map((e) => e.filename)));
  }, [entries]);

  return {
    ...sftp,
    path: path || sftp.cwd,
    entries: sortedEntries,
    loading,
    progress,
    selected,
    viewMode,
    setViewMode,
    sortField,
    sortDir,
    toggleSort,
    openFile,
    setOpenFile,
    refresh,
    navigateTo,
    goUp,
    openEntry,
    uploadFiles,
    downloadEntry,
    deleteSelected,
    deleteEntries,
    renameEntry,
    mkdir,
    createFile,
    chmod,
    compressSelected,
    extractArchive,
    breadcrumbs,
    toggleSelect,
    selectAll,
    clearSelection: () => setSelected(new Set()),
    sudoOpen: !!sudoPrompt,
    resolveSudo,
    withSudo,
    formatFileSize,
    modeToOctal,
  };
}

export type FileManagerState = ReturnType<typeof useFileManager>;
