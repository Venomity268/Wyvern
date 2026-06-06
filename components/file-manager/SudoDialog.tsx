"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface SudoDialogProps {
  open: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function SudoDialog({ open, onSubmit, onCancel }: SudoDialogProps) {
  const [password, setPassword] = useState("");

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <form
        className="w-full max-w-sm space-y-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(password);
          setPassword("");
        }}
      >
        <p className="text-sm font-medium text-zinc-100">Sudo password required</p>
        <p className="text-xs text-zinc-400">
          This operation needs elevated permissions. Enter your sudo password to retry.
        </p>
        <div className="space-y-1">
          <Label className="text-zinc-400">Password</Label>
          <Input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-zinc-700 bg-zinc-800 text-zinc-100"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!password}>
            Retry
          </Button>
        </div>
      </form>
    </div>
  );
}
