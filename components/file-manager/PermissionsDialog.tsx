"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import type { SftpEntry } from "@/lib/sftp/protocol";
import { modeToOctal } from "@/lib/sftp/protocol";

interface PermissionsDialogProps {
  entry: SftpEntry;
  onSave: (mode: string) => void;
  onClose: () => void;
}

export function PermissionsDialog({ entry, onSave, onClose }: PermissionsDialogProps) {
  const [mode, setMode] = useState(modeToOctal(entry.attrs.mode));

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <form
        className="w-full max-w-sm space-y-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(mode.padStart(3, "0"));
        }}
      >
        <p className="text-sm font-medium text-zinc-100">Permissions — {entry.filename}</p>
        {entry.longname && (
          <p className="font-mono text-xs text-zinc-500">{entry.longname}</p>
        )}
        <div className="space-y-1">
          <Label className="text-zinc-400">Mode (octal)</Label>
          <Input
            value={mode}
            onChange={(e) => setMode(e.target.value.replace(/[^0-7]/g, "").slice(0, 4))}
            className="border-zinc-700 bg-zinc-800 font-mono text-zinc-100"
            placeholder="755"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Apply
          </Button>
        </div>
      </form>
    </div>
  );
}
