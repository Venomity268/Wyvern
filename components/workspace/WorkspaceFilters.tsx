"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FolderTree, type FolderOption } from "@/components/workspace/FolderTree";
import { cn } from "@/lib/utils";

interface WorkspaceFiltersProps {
  folders: FolderOption[];
  allTags: string[];
  selectedFolderId: string | null;
  selectedTag: string | null;
  onSelectFolder: (id: string | null) => void;
  onSelectTag: (tag: string | null) => void;
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

function FiltersPanel(props: WorkspaceFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Folders</h3>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => props.onStartCreateFolder(null)}
          >
            New
          </Button>
        </div>
        <FolderTree
          folders={props.folders}
          selectedFolderId={props.selectedFolderId}
          onSelectFolder={props.onSelectFolder}
          isCreatingFolder={props.isCreatingFolder}
          creatingFolderParentId={props.creatingFolderParentId}
          newFolderName={props.newFolderName}
          onNewFolderNameChange={props.onNewFolderNameChange}
          onStartCreateFolder={props.onStartCreateFolder}
          onCreateFolder={props.onCreateFolder}
          onCancelCreateFolder={props.onCancelCreateFolder}
          editingFolderId={props.editingFolderId}
          editingFolderName={props.editingFolderName}
          onEditingFolderNameChange={props.onEditingFolderNameChange}
          onStartEditFolder={props.onStartEditFolder}
          onRenameFolder={props.onRenameFolder}
          onCancelEditFolder={props.onCancelEditFolder}
          onDeleteFolder={props.onDeleteFolder}
        />
      </div>

      {props.allTags.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">Tags</h3>
          <div className="flex max-h-[160px] flex-wrap gap-1.5 overflow-y-auto">
            {props.allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => props.onSelectTag(props.selectedTag === tag ? null : tag)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  props.selectedTag === tag ?
                    "border-primary bg-primary/10 text-primary"
                  : "border-border bg-input text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkspaceFilters(props: WorkspaceFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const hasActiveFilters = props.selectedFolderId !== null || props.selectedTag !== null;

  return (
    <>
      <div className="lg:hidden">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-auto">
              Active
            </Badge>
          )}
        </Button>
        {mobileOpen && <div className="mt-3">{FiltersPanel(props)}</div>}
      </div>

      <div className="hidden w-60 shrink-0 lg:block">
        <FiltersPanel {...props} />
      </div>
    </>
  );
}
