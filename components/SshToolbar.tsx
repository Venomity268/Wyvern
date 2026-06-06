"use client";

import { useEffect, useState } from "react";
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
  Keyboard,
  Box,
} from "lucide-react";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

interface SshToolbarProps {
  isFullscreen: boolean;
  clipboardOpen: boolean;
  portForwardOpen: boolean;
  sftpOpen: boolean;
  dockerOpen: boolean;
  showPortForward?: boolean;
  pasteText: string;
  onToggleFullscreen: () => void;
  onToggleClipboard: () => void;
  onTogglePortForward: () => void;
  onToggleSftp: () => void;
  onToggleDocker: () => void;
  onPasteTextChange: (text: string) => void;
  onSendPaste: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onFocusTerminal?: () => void;
}

export function SshToolbar({
  isFullscreen,
  clipboardOpen,
  portForwardOpen,
  sftpOpen,
  dockerOpen,
  showPortForward = true,
  pasteText,
  onToggleFullscreen,
  onToggleClipboard,
  onTogglePortForward,
  onToggleSftp,
  onToggleDocker,
  onPasteTextChange,
  onSendPaste,
  onReconnect,
  onDisconnect,
  onFocusTerminal,
}: SshToolbarProps) {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const timeout = setTimeout(() => {
        setIsTouchDevice(isTouch);
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, []);

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/80">
      <div className="flex flex-nowrap items-center gap-0.5 sm:gap-1 px-1 py-0.5 sm:px-2 sm:py-1 overflow-x-auto scrollbar-none whitespace-nowrap">
        {onFocusTerminal && isTouchDevice && isMobile && (
          <Button
            variant="ghost"
            className="h-7 sm:h-8 text-zinc-300 px-1.5 sm:px-2.5 text-[11px] sm:text-xs gap-1 shrink-0"
            onClick={onFocusTerminal}
            title="Focus keyboard"
          >
            <Keyboard className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            Keyboard
          </Button>
        )}
        {showPortForward && (
          <Button
            variant={portForwardOpen ? "secondary" : "ghost"}
            className="h-7 sm:h-8 text-zinc-300 px-1.5 sm:px-2.5 text-[11px] sm:text-xs gap-1 shrink-0"
            onClick={onTogglePortForward}
            title="Port forwarding"
          >
            <Network className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            Ports
          </Button>
        )}
        <Button
          variant={sftpOpen ? "secondary" : "ghost"}
          className="h-7 sm:h-8 text-zinc-300 px-1.5 sm:px-2.5 text-[11px] sm:text-xs gap-1 shrink-0"
          onClick={onToggleSftp}
          title="Remote file browser"
        >
          <FolderOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          Files
        </Button>
        <Button
          variant={dockerOpen ? "secondary" : "ghost"}
          className="h-7 sm:h-8 text-zinc-300 px-1.5 sm:px-2.5 text-[11px] sm:text-xs gap-1 shrink-0"
          onClick={onToggleDocker}
          title="Remote Docker containers"
        >
          <Box className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          Docker
        </Button>

        <span className="mx-1 h-5 w-px bg-zinc-700" />

        <Button
          variant={clipboardOpen ? "secondary" : "ghost"}
          className="h-7 sm:h-8 text-zinc-300 px-1.5 sm:px-2.5 text-[11px] sm:text-xs gap-1 shrink-0"
          onClick={onToggleClipboard}
          title="Paste text into terminal"
        >
          <ClipboardPaste className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          Paste
        </Button>
        <Button
          variant="ghost"
          className="h-7 sm:h-8 text-zinc-300 px-1.5 sm:px-2.5 text-[11px] sm:text-xs gap-1 shrink-0"
          onClick={onToggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <>
              <Minimize className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              Exit
            </>
          ) : (
            <>
              <Maximize className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              Full<span className="hidden sm:inline">screen</span>
            </>
          )}
        </Button>

        <span className="mx-1 h-5 w-px bg-zinc-700" />

        <Button
          variant="ghost"
          className="h-7 sm:h-8 text-zinc-300 px-1.5 sm:px-2.5 text-[11px] sm:text-xs gap-1 shrink-0"
          onClick={onReconnect}
        >
          <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          Reconnect
        </Button>
        <Button
          variant="ghost"
          className="h-7 sm:h-8 text-zinc-300 px-1.5 sm:px-2.5 text-[11px] sm:text-xs gap-1 shrink-0"
          onClick={onDisconnect}
        >
          <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
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
