"use client";

import { Button } from "@/components/ui/button";
import {
  ArrowUp,
  FolderPlus,
  Grid3X3,
  List,
  Plus,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import type { FileManagerState } from "./hooks/useFileManager";

interface FileToolbarProps {
  fm: FileManagerState;
  onClose?: () => void;
  onUploadClick: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
}

export function FileToolbar({
  fm,
  onClose,
  onUploadClick,
  onNewFolder,
  onNewFile,
}: FileToolbarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
      <span className="mr-1 text-sm font-medium text-zinc-100">Files</span>
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={fm.goUp} title="Up">
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void fm.refresh()} title="Refresh">
        <RefreshCw className={`h-3.5 w-3.5 ${fm.loading ? "animate-spin" : ""}`} />
      </Button>
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onUploadClick} title="Upload">
        <Upload className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onNewFile} title="New file">
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onNewFolder} title="New folder">
        <FolderPlus className="h-3.5 w-3.5" />
      </Button>
      <span className="mx-1 h-4 w-px bg-zinc-700" />
      <Button
        variant={fm.viewMode === "list" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 px-2"
        onClick={() => fm.setViewMode("list")}
        title="List view"
      >
        <List className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={fm.viewMode === "grid" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 px-2"
        onClick={() => fm.setViewMode("grid")}
        title="Grid view"
      >
        <Grid3X3 className="h-3.5 w-3.5" />
      </Button>
      {onClose && (
        <Button variant="ghost" size="sm" className="ml-auto h-7 text-zinc-400" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
