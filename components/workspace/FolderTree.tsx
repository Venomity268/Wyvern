"use client";

import {
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface FolderOption {
  id: string;
  workspace_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

interface FolderTreeProps {
  folders: FolderOption[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  isCreatingFolder: boolean;
  creatingFolderParentId: string | null;
  newFolderName: string;
  onNewFolderNameChange: (name: string) => void;
  onStartCreateFolder: (parentId: string | null) => void;
  onCreateFolder: () => void;
  onCancelCreateFolder: () => void;
  editingFolderId: string | null;
  editingFolderName: string;
  onEditingFolderNameChange: (name: string) => void;
  onStartEditFolder: (id: string, name: string) => void;
  onRenameFolder: () => void;
  onCancelEditFolder: () => void;
  onDeleteFolder: (id: string) => void;
}

function renderFolderTree(
  props: FolderTreeProps,
  parentId: string | null,
  depth: number,
): React.ReactNode[] {
  const list = props.folders.filter((f) => f.parent_id === parentId);
  return list.map((f) => {
    const isSelected = props.selectedFolderId === f.id;
    const isEditing = props.editingFolderId === f.id;
    return (
      <div key={f.id} className="space-y-0.5">
        {isEditing ? (
          <div className="space-y-2 rounded-md border border-border bg-input p-2">
            <Input
              className="h-8 text-xs"
              value={props.editingFolderName}
              onChange={(e) => props.onEditingFolderNameChange(e.target.value)}
              placeholder="Folder name"
              autoFocus
            />
            <div className="flex justify-end gap-1">
              <Button size="sm" className="h-7 text-xs" onClick={props.onRenameFolder}>
                Save
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={props.onCancelEditFolder}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "group flex items-center justify-between rounded-md px-2 py-1.5 text-sm",
              isSelected
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            style={{ paddingLeft: `${Math.max(8, depth * 14 + 8)}px` }}
          >
            <button
              type="button"
              onClick={() => props.onSelectFolder(f.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              {isSelected ?
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              : <Folder className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate text-xs">{f.name}</span>
            </button>
            <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
              <button
                type="button"
                title="Add subfolder"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onStartCreateFolder(f.id);
                }}
              >
                <FolderPlus className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Rename folder"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onStartEditFolder(f.id, f.name);
                }}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Delete folder"
                className="rounded p-1 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDeleteFolder(f.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
        {renderFolderTree(props, f.id, depth + 1)}
      </div>
    );
  });
}

export function FolderTree(props: FolderTreeProps) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => props.onSelectFolder(null)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
          props.selectedFolderId === null ?
            "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        All connections
      </button>
      <button
        type="button"
        onClick={() => props.onSelectFolder("unassigned")}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
          props.selectedFolderId === "unassigned" ?
            "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Folder className="h-3.5 w-3.5 shrink-0" />
        Unassigned
      </button>

      {props.isCreatingFolder && (
        <div className="space-y-2 rounded-md border border-border bg-input p-2">
          <span className="block text-xs font-medium text-muted-foreground">
            {props.creatingFolderParentId ? "New subfolder" : "New folder"}
          </span>
          <Input
            className="h-8 text-xs"
            value={props.newFolderName}
            onChange={(e) => props.onNewFolderNameChange(e.target.value)}
            placeholder="Folder name"
            autoFocus
          />
          <div className="flex justify-end gap-1">
            <Button size="sm" className="h-7 text-xs" onClick={props.onCreateFolder}>
              Create
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={props.onCancelCreateFolder}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-1 max-h-[280px] space-y-0.5 overflow-y-auto pr-1">
        {renderFolderTree(props, null, 0)}
      </div>
    </div>
  );
}

export function getFolderPath(fid: string | null, list: FolderOption[]): string {
  if (!fid) return "";
  const f = list.find((item) => item.id === fid);
  if (!f) return "";
  const parentPath = getFolderPath(f.parent_id, list);
  return parentPath ? `${parentPath} / ${f.name}` : f.name;
}

export function getFolderDescendants(folderId: string, folderList: FolderOption[]): string[] {
  const ids = [folderId];
  const children = folderList.filter((f) => f.parent_id === folderId);
  for (const child of children) {
    ids.push(...getFolderDescendants(child.id, folderList));
  }
  return ids;
}
