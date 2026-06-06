"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { GuacProtocol } from "@/lib/protocols";
import type { ZoomMode } from "@/lib/guac/display";
import {
  ClipboardCopy,
  ClipboardPaste,
  HelpCircle,
  LogOut,
  Maximize,
  Minimize,
  Monitor,
  Network,
  RefreshCw,
  Scan,
  Keyboard,
  Terminal,
} from "lucide-react";

interface DesktopToolbarProps {
  protocol: GuacProtocol;
  zoomMode: ZoomMode;
  isFullscreen: boolean;
  clipboardOpen: boolean;
  remoteClipboard: string;
  pasteText: string;
  onZoomModeChange: (mode: ZoomMode) => void;
  onToggleFullscreen: () => void;
  onToggleClipboard: () => void;
  onPasteTextChange: (text: string) => void;
  onSendToRemote: () => void;
  onCopyLocalClipboard: () => void;
  onCtrlAltDel: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  sshOpen?: boolean;
  portForwardOpen?: boolean;
  onToggleSsh?: () => void;
  onTogglePortForward?: () => void;
  hasSshConnection?: boolean;
}

export function DesktopToolbar({
  protocol,
  zoomMode,
  isFullscreen,
  clipboardOpen,
  remoteClipboard,
  pasteText,
  onZoomModeChange,
  onToggleFullscreen,
  onToggleClipboard,
  onPasteTextChange,
  onSendToRemote,
  onCopyLocalClipboard,
  onCtrlAltDel,
  onReconnect,
  onDisconnect,
  sshOpen = false,
  portForwardOpen = false,
  onToggleSsh,
  onTogglePortForward,
  hasSshConnection = false,
}: DesktopToolbarProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!helpOpen) return;
    function handleClick(e: MouseEvent) {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setHelpOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [helpOpen]);

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/80">
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex flex-1 flex-nowrap items-center gap-1 overflow-x-auto scrollbar-none whitespace-nowrap min-w-0 py-0.5">
        <Button
          variant={zoomMode === "fit" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 text-zinc-300"
          onClick={() => onZoomModeChange("fit")}
          title="Fit to window"
        >
          <Scan className="mr-1 h-4 w-4" />
          Fit
        </Button>
        <Button
          variant={zoomMode === "actual" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 text-zinc-300"
          onClick={() => onZoomModeChange("actual")}
          title="Actual size (100%)"
        >
          <Monitor className="mr-1 h-4 w-4" />
          100%
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

        <Button
          variant={clipboardOpen ? "secondary" : "ghost"}
          size="sm"
          className="h-8 text-zinc-300"
          onClick={onToggleClipboard}
          title="Clipboard panel"
        >
          <ClipboardPaste className="mr-1 h-4 w-4" />
          Clipboard
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-zinc-300"
          onClick={onCopyLocalClipboard}
          title="Paste from local clipboard to remote"
        >
          <ClipboardCopy className="mr-1 h-4 w-4" />
          Paste local
        </Button>

        {protocol === "rdp" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-zinc-300"
            onClick={onCtrlAltDel}
            title="Send Ctrl+Alt+Del"
          >
            <Keyboard className="mr-1 h-4 w-4" />
            Ctrl+Alt+Del
          </Button>
        )}

        <span className="mx-1 h-5 w-px bg-zinc-700" />

        {hasSshConnection && onToggleSsh && (
          <Button
            variant={sshOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-zinc-300"
            onClick={onToggleSsh}
            title="SSH terminal split view"
          >
            <Terminal className="mr-1 h-4 w-4" />
            SSH
          </Button>
        )}
        {hasSshConnection && onTogglePortForward && (
          <Button
            variant={portForwardOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-zinc-300"
            onClick={onTogglePortForward}
            title="Expose remote ports via SSH tunnel"
          >
            <Network className="mr-1 h-4 w-4" />
            Ports
          </Button>
        )}

        <span className="mx-1 h-5 w-px bg-zinc-700" />

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-zinc-300"
          onClick={onReconnect}
          title="Reconnect"
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Reconnect
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-zinc-300"
          onClick={onDisconnect}
          title="Disconnect"
        >
          <LogOut className="mr-1 h-4 w-4" />
          Disconnect
        </Button>
        </div>

        <div className="relative ml-2 shrink-0" ref={helpRef}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-zinc-400"
            onClick={() => setHelpOpen((v) => !v)}
            title="Shortcuts help"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          {helpOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-md border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-300 shadow-lg">
              <p className="mb-2 font-medium text-zinc-100">Shortcuts & tips</p>
              <ul className="space-y-1.5">
                <li>
                  <strong>Fit / 100%</strong> — scale the remote desktop to the window or native
                  resolution.
                </li>
                <li>
                  <strong>Fullscreen</strong> — browser fullscreen on the display area (F11 also
                  works).
                </li>
                <li>
                  <strong>Clipboard</strong> — type or paste text, then Send to remote. Remote
                  copies appear automatically.
                </li>
                <li>
                  <strong>Paste local</strong> — reads your OS clipboard and sends it to the remote
                  session.
                </li>
                {protocol === "rdp" && (
                  <li>
                    <strong>Ctrl+Alt+Del</strong> — opens the Windows security / login screen.
                  </li>
                )}
                {hasSshConnection && (
                  <>
                    <li>
                      <strong>SSH</strong> — open a split-pane terminal to the same host via SSH.
                    </li>
                    <li>
                      <strong>Ports</strong> — expose remote services on your machine through an SSH
                      tunnel.
                    </li>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
