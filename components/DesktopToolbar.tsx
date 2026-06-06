"use client";

import { useEffect, useRef, useState } from "react";
import type { GuacProtocol } from "@/lib/protocols";
import type { ZoomMode } from "@/lib/guac/display";
import {
  ClipboardCopy,
  ClipboardPaste,
  HelpCircle,
  Keyboard,
  LogOut,
  Maximize,
  Minimize,
  Monitor,
  Network,
  RefreshCw,
  Scan,
  Terminal,
} from "lucide-react";
import { useIsTouchDevice } from "@/lib/hooks/useIsTouchDevice";
import { SessionToolButton, SessionToolDivider } from "@/components/session/SessionToolButton";
import { Button } from "@/components/ui/button";

interface DesktopToolbarProps {
  protocol: GuacProtocol;
  zoomMode: ZoomMode;
  isFullscreen: boolean;
  clipboardOpen: boolean;
  onZoomModeChange: (mode: ZoomMode) => void;
  onToggleFullscreen: () => void;
  onToggleClipboard: () => void;
  onCopyLocalClipboard: () => void;
  onCtrlAltDel: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onFocusDesktop?: () => void;
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
  onZoomModeChange,
  onToggleFullscreen,
  onToggleClipboard,
  onCopyLocalClipboard,
  onCtrlAltDel,
  onReconnect,
  onDisconnect,
  onFocusDesktop,
  sshOpen = false,
  portForwardOpen = false,
  onToggleSsh,
  onTogglePortForward,
  hasSshConnection = false,
}: DesktopToolbarProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const isTouchDevice = useIsTouchDevice();

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
    <>
      {onFocusDesktop && isTouchDevice && (
        <SessionToolButton title="Focus remote desktop" onClick={onFocusDesktop}>
          <Keyboard className="h-4 w-4" />
        </SessionToolButton>
      )}
      <SessionToolButton
        active={zoomMode === "fit"}
        title="Fit to window"
        onClick={() => onZoomModeChange("fit")}
      >
        <Scan className="h-4 w-4" />
      </SessionToolButton>
      <SessionToolButton
        active={zoomMode === "actual"}
        title="Actual size (100%)"
        onClick={() => onZoomModeChange("actual")}
      >
        <Monitor className="h-4 w-4" />
      </SessionToolButton>
      <SessionToolButton
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        onClick={onToggleFullscreen}
      >
        {isFullscreen ?
          <Minimize className="h-4 w-4" />
        : <Maximize className="h-4 w-4" />}
      </SessionToolButton>

      <SessionToolDivider />

      <SessionToolButton
        active={clipboardOpen}
        title="Clipboard panel"
        onClick={onToggleClipboard}
      >
        <ClipboardPaste className="h-4 w-4" />
      </SessionToolButton>
      <SessionToolButton title="Paste from local clipboard" onClick={onCopyLocalClipboard}>
        <ClipboardCopy className="h-4 w-4" />
      </SessionToolButton>

      {protocol === "rdp" && (
        <SessionToolButton title="Send Ctrl+Alt+Del" onClick={onCtrlAltDel}>
          <Keyboard className="h-4 w-4" />
        </SessionToolButton>
      )}

      {hasSshConnection && onToggleSsh && (
        <>
          <SessionToolDivider />
          <SessionToolButton active={sshOpen} title="SSH terminal split" onClick={onToggleSsh}>
            <Terminal className="h-4 w-4" />
          </SessionToolButton>
        </>
      )}
      {hasSshConnection && onTogglePortForward && (
        <SessionToolButton
          active={portForwardOpen}
          title="SSH port forwarding"
          onClick={onTogglePortForward}
        >
          <Network className="h-4 w-4" />
        </SessionToolButton>
      )}

      <SessionToolDivider />

      <SessionToolButton title="Reconnect" onClick={onReconnect}>
        <RefreshCw className="h-4 w-4" />
      </SessionToolButton>
      <SessionToolButton title="Disconnect" destructive onClick={onDisconnect}>
        <LogOut className="h-4 w-4" />
      </SessionToolButton>

      <div className="relative ml-0.5 shrink-0" ref={helpRef}>
        <SessionToolButton title="Shortcuts help" onClick={() => setHelpOpen((v) => !v)}>
          <HelpCircle className="h-4 w-4" />
        </SessionToolButton>
        {helpOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground shadow-xl">
            <p className="mb-2 font-medium text-foreground">Shortcuts & tips</p>
            <ul className="space-y-1.5">
              <li>
                <strong className="text-foreground">Fit / 100%</strong> — scale the remote desktop to
                the window or native resolution.
              </li>
              <li>
                <strong className="text-foreground">Fullscreen</strong> — browser fullscreen on the
                display area (F11 also works).
              </li>
              <li>
                <strong className="text-foreground">Clipboard</strong> — type or paste text, then Send
                to remote. Remote copies appear automatically.
              </li>
              <li>
                <strong className="text-foreground">Paste local</strong> — reads your OS clipboard and
                sends it to the remote session.
              </li>
              {protocol === "rdp" && (
                <li>
                  <strong className="text-foreground">Ctrl+Alt+Del</strong> — opens the Windows
                  security / login screen.
                </li>
              )}
              {hasSshConnection && (
                <>
                  <li>
                    <strong className="text-foreground">SSH</strong> — open a split-pane terminal to
                    the same host via SSH.
                  </li>
                  <li>
                    <strong className="text-foreground">Ports</strong> — expose remote services on
                    your machine through an SSH tunnel.
                  </li>
                </>
              )}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 h-7 w-full text-muted-foreground"
              onClick={() => setHelpOpen(false)}
            >
              Close
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
