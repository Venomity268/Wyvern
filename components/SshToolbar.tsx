"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ClipboardPaste,
  FolderOpen,
  LogOut,
  Maximize,
  Minimize,
  Network,
  RefreshCw,
  Upload,
  Download,
} from "lucide-react";

interface SshToolbarProps {
  isFullscreen: boolean;
  clipboardOpen: boolean;
  portForwardOpen: boolean;
  sftpOpen: boolean;
  showPortForward?: boolean;
  pasteText: string;
  onToggleFullscreen: () => void;
  onToggleClipboard: () => void;
  onTogglePortForward: () => void;
  onToggleSftp: () => void;
  onPasteTextChange: (text: string) => void;
  onSendPaste: () => void;
  onSendFile: () => void;
  onReceiveFile: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}

export function SshToolbar({
  isFullscreen,
  clipboardOpen,
  portForwardOpen,
  sftpOpen,
  showPortForward = true,
  pasteText,
  onToggleFullscreen,
  onToggleClipboard,
  onTogglePortForward,
  onToggleSftp,
  onPasteTextChange,
  onSendPaste,
  onSendFile,
  onReceiveFile,
  onReconnect,
  onDisconnect,
}: SshToolbarProps) {
  return (
    <div className="border-b border-zinc-800 bg-zinc-900/80">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1">
        {showPortForward && (
          <Button
            variant={portForwardOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-zinc-300"
            onClick={onTogglePortForward}
            title="Port forwarding"
          >
            <Network className="mr-1 h-4 w-4" />
            Ports
          </Button>
        )}
        <Button
          variant={sftpOpen ? "secondary" : "ghost"}
          size="sm"
          className="h-8 text-zinc-300"
          onClick={onToggleSftp}
          title="Remote file browser"
        >
          <FolderOpen className="mr-1 h-4 w-4" />
          Files
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-zinc-300"
          onClick={onSendFile}
          title="Send file via zmodem (sz)"
        >
          <Upload className="mr-1 h-4 w-4" />
          Send file
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-zinc-300"
          onClick={onReceiveFile}
          title="Receive file via zmodem (rz)"
        >
          <Download className="mr-1 h-4 w-4" />
          Receive file
        </Button>

        <span className="mx-1 h-5 w-px bg-zinc-700" />

        <Button
          variant={clipboardOpen ? "secondary" : "ghost"}
          size="sm"
          className="h-8 text-zinc-300"
          onClick={onToggleClipboard}
          title="Paste text into terminal"
        >
          <ClipboardPaste className="mr-1 h-4 w-4" />
          Paste
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-zinc-300"
          onClick={onToggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <Minimize className="mr-1 h-4 w-4" />
          ) : (
            <Maximize className="mr-1 h-4 w-4" />
          )}
          {isFullscreen ? "Exit" : "Fullscreen"}
        </Button>

        <span className="mx-1 h-5 w-px bg-zinc-700" />

        <Button variant="ghost" size="sm" className="h-8 text-zinc-300" onClick={onReconnect}>
          <RefreshCw className="mr-1 h-4 w-4" />
          Reconnect
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-zinc-300" onClick={onDisconnect}>
          <LogOut className="mr-1 h-4 w-4" />
          Disconnect
        </Button>
      </div>

      {clipboardOpen && (
        <div className="border-t border-zinc-800 px-3 py-2">
          <Textarea
            value={pasteText}
            onChange={(e) => onPasteTextChange(e.target.value)}
            placeholder="Paste text to send to the terminal…"
            rows={3}
            className="resize-none border-zinc-700 bg-zinc-800 font-mono text-sm text-zinc-100"
          />
          <Button size="sm" className="mt-2" onClick={onSendPaste} disabled={!pasteText.trim()}>
            Send to terminal
          </Button>
        </div>
      )}
    </div>
  );
}
