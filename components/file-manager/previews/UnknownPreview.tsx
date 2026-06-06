"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UnknownPreviewProps {
  filename: string;
  size: number;
  onDownload: () => void;
}

export function UnknownPreview({ filename, size, onDownload }: UnknownPreviewProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-zinc-300">Cannot preview this file type</p>
      <p className="text-xs text-zinc-500">
        {filename} ({(size / 1024).toFixed(1)} KB)
      </p>
      <Button size="sm" variant="outline" onClick={onDownload}>
        <Download className="mr-1 h-4 w-4" />
        Download to view
      </Button>
    </div>
  );
}
