"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Box,
  ClipboardPaste,
  FolderOpen,
  Keyboard,
  LogOut,
  Maximize,
  Minimize,
  Network,
  RefreshCw,
  Code2,
  RadioTower,
  Video,
} from "lucide-react";
import { useIsTouchDevice } from "@/lib/hooks/useIsTouchDevice";
import { SessionToolButton, SessionToolDivider } from "@/components/session/SessionToolButton";

interface SshToolbarProps {
  isFullscreen: boolean;
  clipboardOpen: boolean;
  portForwardOpen: boolean;
  sftpOpen: boolean;
  dockerOpen: boolean;
  snippetsOpen: boolean;
  isBroadcasting?: boolean;
  isRecording?: boolean;
  showPortForward?: boolean;
  onToggleFullscreen: () => void;
  onToggleClipboard: () => void;
  onTogglePortForward: () => void;
  onToggleSftp: () => void;
  onToggleDocker: () => void;
  onToggleSnippets: () => void;
  onToggleBroadcasting?: () => void;
  onToggleRecording?: () => void;
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
  snippetsOpen,
  isBroadcasting,
  isRecording,
  showPortForward = true,
  onToggleFullscreen,
  onToggleClipboard,
  onTogglePortForward,
  onToggleSftp,
  onToggleDocker,
  onToggleSnippets,
  onToggleBroadcasting,
  onToggleRecording,
  onReconnect,
  onDisconnect,
  onFocusTerminal,
}: SshToolbarProps) {
  const isTouchDevice = useIsTouchDevice();

  return (
    <>
      {onFocusTerminal && isTouchDevice && (
        <SessionToolButton title="Show keyboard" onClick={onFocusTerminal}>
          <Keyboard className="h-4 w-4" />
        </SessionToolButton>
      )}
      {showPortForward && (
        <SessionToolButton
          active={portForwardOpen}
          title="Port forwarding"
          onClick={onTogglePortForward}
        >
          <Network className="h-4 w-4" />
        </SessionToolButton>
      )}
      <SessionToolButton active={sftpOpen} title="Remote files" onClick={onToggleSftp}>
        <FolderOpen className="h-4 w-4" />
      </SessionToolButton>
      <SessionToolButton active={dockerOpen} title="Docker containers" onClick={onToggleDocker}>
        <Box className="h-4 w-4" />
      </SessionToolButton>
      <SessionToolButton active={snippetsOpen} title="Command Snippets" onClick={onToggleSnippets}>
        <Code2 className="h-4 w-4" />
      </SessionToolButton>

      <SessionToolDivider />

      {onToggleBroadcasting && (
        <SessionToolButton
          active={isBroadcasting}
          title={isBroadcasting ? "Stop Broadcasting Input" : "Broadcast Input to All Panes"}
          onClick={onToggleBroadcasting}
        >
          <RadioTower className={`h-4 w-4 ${isBroadcasting ? "text-red-400" : ""}`} />
        </SessionToolButton>
      )}

      {onToggleRecording && (
        <SessionToolButton
          active={isRecording}
          title={isRecording ? "Stop Recording (Export .cast)" : "Start Recording Session"}
          onClick={onToggleRecording}
        >
          <Video className={`h-4 w-4 ${isRecording ? "text-red-400 animate-pulse" : ""}`} />
        </SessionToolButton>
      )}

      <SessionToolButton
        active={clipboardOpen}
        title="Paste into terminal"
        onClick={onToggleClipboard}
      >
        <ClipboardPaste className="h-4 w-4" />
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

      <SessionToolButton title="Reconnect" onClick={onReconnect}>
        <RefreshCw className="h-4 w-4" />
      </SessionToolButton>
      <SessionToolButton title="Disconnect" destructive onClick={onDisconnect}>
        <LogOut className="h-4 w-4" />
      </SessionToolButton>
    </>
  );
}

interface SshPastePanelProps {
  pasteText: string;
  onPasteTextChange: (text: string) => void;
  onSendPaste: () => void;
  onClose: () => void;
}

export function SshPastePanel({
  pasteText,
  onPasteTextChange,
  onSendPaste,
  onClose,
}: SshPastePanelProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-3">
      <div className="pointer-events-auto w-full max-w-xl rounded-lg border border-border bg-card p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Paste to terminal</p>
          <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={onClose}>
            Close
          </Button>
        </div>
        <Textarea
          value={pasteText}
          onChange={(e) => onPasteTextChange(e.target.value)}
          placeholder="Paste text to send to the terminal…"
          rows={4}
          className="resize-none font-mono text-sm"
        />
        <Button size="sm" className="mt-3" onClick={onSendPaste} disabled={!pasteText.trim()}>
          Send to terminal
        </Button>
      </div>
    </div>
  );
}
