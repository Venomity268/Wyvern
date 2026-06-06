"use client";

import { useCallback, useState, useRef } from "react";
import { SessionLayout } from "@/components/SessionLayout";
import { SplitPane } from "@/components/SplitPane";
import {
  SshTerminal,
  type SshTerminalHandle,
  type SshConnectionState,
} from "@/components/SshTerminal";
import { SshToolbar } from "@/components/SshToolbar";
import { PortForwardPanel } from "@/components/PortForwardPanel";
import { FileManagerPanel } from "@/components/file-manager/FileManagerPanel";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

interface SshSessionViewerProps {
  connectionId?: string;
  quickSessionId?: string;
  connectionName: string;
  hostname: string;
  defaultUsername?: string | null;
  hasStoredCredential: boolean;
  chromeless?: boolean;
}

type SidePanel = "none" | "ports" | "sftp";

interface SessionCredentials {
  username: string;
  password?: string;
  privateKey?: string;
}

export function SshSessionViewer({
  connectionId,
  quickSessionId,
  connectionName,
  hostname,
  defaultUsername,
  hasStoredCredential,
  chromeless = false,
}: SshSessionViewerProps) {
  const terminalRef = useRef<SshTerminalHandle>(null);
  const terminalPaneRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shellWs, setShellWs] = useState<WebSocket | null>(null);
  const isMobile = useIsMobile();
  const [sessionState, setSessionState] = useState<SshConnectionState>(
    hasStoredCredential ? "connecting" : "auth",
  );
  const [sidePanel, setSidePanel] = useState<SidePanel>("none");
  const [portOverlay, setPortOverlay] = useState(false);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [sessionCredentials, setSessionCredentials] = useState<SessionCredentials | null>(null);

  const isConnected = sessionState === "connected";

  const resetSidePanels = useCallback(() => {
    setSidePanel("none");
    setPortOverlay(false);
    setShellWs(null);
    setSessionCredentials(null);
  }, []);

  const togglePortForward = () => {
    if (!isConnected) return;
    setSidePanel((p) => (p === "ports" ? "none" : "ports"));
    setPortOverlay(false);
  };

  const toggleSftp = () => {
    if (!isConnected) return;
    setSidePanel((p) => (p === "sftp" ? "none" : "sftp"));
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleDisconnect = () => {
    terminalRef.current?.disconnect();
    resetSidePanels();
    setSessionState("auth");
  };

  const handleReconnect = () => {
    resetSidePanels();
    setSessionState(hasStoredCredential ? "connecting" : "auth");
    setReconnectKey((k) => k + 1);
  };

  const canPortForward = Boolean(connectionId) && !isMobile;

  const secondary =
    sidePanel === "ports" && canPortForward ? (
      <div className="h-full overflow-auto bg-zinc-950 p-2">
        <PortForwardPanel
          mode="multiplexed"
          shellWebSocket={shellWs}
          connectionId={connectionId!}
          connectionName={connectionName}
          defaultUsername={defaultUsername}
          hasStoredCredential={hasStoredCredential}
          remoteHostname={hostname}
          onClose={() => setSidePanel("none")}
        />
      </div>
    ) : sidePanel === "sftp" ? (
      <div className="h-full min-h-0 overflow-hidden bg-zinc-950">
        <FileManagerPanel
          key={`files-${connectionId || quickSessionId}-${reconnectKey}`}
          connectionId={connectionId}
          quickSessionId={quickSessionId}
          defaultUsername={defaultUsername}
          hasStoredCredential={hasStoredCredential}
          sessionAuth={sessionCredentials}
          onClose={() => setSidePanel("none")}
        />
      </div>
    ) : null;

  const sessionBody = (
    <div ref={containerRef} className="relative flex h-full flex-col bg-zinc-950">
      {isConnected && (
        <SshToolbar
          isFullscreen={isFullscreen}
          clipboardOpen={clipboardOpen}
          portForwardOpen={sidePanel === "ports" || portOverlay}
          sftpOpen={sidePanel === "sftp"}
          showPortForward={canPortForward}
          pasteText={pasteText}
          onToggleFullscreen={toggleFullscreen}
          onToggleClipboard={() => setClipboardOpen((v) => !v)}
          onTogglePortForward={togglePortForward}
          onToggleSftp={toggleSftp}
          onPasteTextChange={setPasteText}
          onSendPaste={() => {
            terminalRef.current?.write(pasteText);
            setPasteText("");
          }}
          onReconnect={handleReconnect}
          onDisconnect={handleDisconnect}
          onFocusTerminal={() => terminalRef.current?.focus()}
        />
      )}

      <div className="relative min-h-0 flex-1 flex flex-col">
        <SplitPane
          primary={
            <div ref={terminalPaneRef} className="relative h-full min-h-0 flex-1">
              <SshTerminal
                key={reconnectKey}
                ref={terminalRef}
                connectionId={connectionId}
                quickSessionId={quickSessionId}
                connectionName={connectionName}
                hostname={hostname}
                defaultUsername={defaultUsername}
                hasStoredCredential={hasStoredCredential}
                variant="embedded"
                chromeless
                sizeContainerRef={terminalPaneRef}
                onStateChange={setSessionState}
                onAuthenticated={setSessionCredentials}
                onWebSocketReady={setShellWs}
                onWebSocketClose={() => setShellWs(null)}
                onDisconnect={resetSidePanels}
              />
            </div>
          }
          secondary={secondary}
          showSecondary={isConnected && sidePanel !== "none"}
          minSecondary={320}
          isMobile={isMobile}
          primaryTabLabel="Terminal"
          secondaryTabLabel={sidePanel === "sftp" ? "Files" : "Ports"}
        />

        {portOverlay && isConnected && canPortForward && (
          <div className="absolute inset-x-4 bottom-4 z-20 max-h-[60%] overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
            <PortForwardPanel
              mode="multiplexed"
              shellWebSocket={shellWs}
              connectionId={connectionId!}
              connectionName={connectionName}
              defaultUsername={defaultUsername}
              hasStoredCredential={hasStoredCredential}
              remoteHostname={hostname}
              onClose={() => setPortOverlay(false)}
            />
          </div>
        )}
      </div>
    </div>
  );

  if (chromeless) {
    return sessionBody;
  }

  return (
    <SessionLayout title={connectionName} subtitle={`SSH → ${hostname}`}>
      {sessionBody}
    </SessionLayout>
  );
}
