"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SessionLayout } from "@/components/SessionLayout";
import { DesktopToolbar } from "@/components/DesktopToolbar";
import { SplitPane } from "@/components/SplitPane";
import { SshTerminal } from "@/components/SshTerminal";
import { PortForwardPanel, type PortForward } from "@/components/PortForwardPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { wsUrl } from "@/lib/utils";
import type { GuacProtocol } from "@/lib/protocols";
import { applyDisplayLayout, type ZoomMode } from "@/lib/guac/display";
import { installClipboardHandler, installPasteHandler, sendTextToRemote } from "@/lib/guac/clipboard";
import { installMouseHandlers } from "@/lib/guac/mouse";
import { configureGuacDisplayElement } from "@/lib/guac/display-element";
import { useIsTouchDevice } from "@/lib/hooks/useIsTouchDevice";
import { sendCtrlAltDel } from "@/lib/guac/rdp";
import { useDisconnectOnLeave } from "@/lib/hooks/useDisconnectOnLeave";
import { usePreventBackspaceNavigation } from "@/lib/hooks/usePreventBackspaceNavigation";
import { Loader2, X } from "lucide-react";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

interface GuacamoleViewerProps {
  connectionId?: string;
  quickSessionId?: string;
  sshConnectionId?: string;
  sshConnectionName?: string;
  connectionName: string;
  hostname: string;
  port: number;
  protocol: GuacProtocol;
  defaultUsername?: string | null;
  hasStoredCredential: boolean;
  hasSshAccess?: boolean;
  sshDefaultUsername?: string | null;
  sshHasStoredCredential?: boolean;
  chromeless?: boolean;
}

type ViewerState = "auth" | "connecting" | "connected" | "error";

const KEEPALIVE_MS = 30_000;
const RESIZE_DEBOUNCE_MS = 150;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GuacClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GuacTunnel = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GuacNamespace = any;

function isLikelyWrongVncPort(protocol: GuacProtocol, port: number): boolean {
  return protocol === "vnc" && (port === 3389 || port === 22 || port === 443);
}

export function GuacamoleViewer({
  connectionId,
  quickSessionId,
  sshConnectionId,
  sshConnectionName,
  connectionName,
  hostname,
  port,
  protocol,
  defaultUsername,
  hasStoredCredential,
  hasSshAccess = false,
  sshDefaultUsername,
  sshHasStoredCredential = false,
  chromeless = false,
}: GuacamoleViewerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveSshConnectionId = sshConnectionId ?? connectionId;
  const effectiveSshConnectionName = sshConnectionName ?? connectionName;

  const sessionRef = useRef<HTMLDivElement>(null);
  const portOverlayRef = useRef<HTMLDivElement>(null);
  const clipboardOverlayRef = useRef<HTMLDivElement>(null);
  const desktopPaneRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const displayElRef = useRef<HTMLElement | null>(null);
  const terminalPaneRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<GuacClient | null>(null);
  const tunnelRef = useRef<GuacTunnel | null>(null);
  const guacRef = useRef<GuacNamespace | null>(null);
  const keyboardRef = useRef<{ onkeydown: null | ((keysym: number) => void); onkeyup: null | ((keysym: number) => void) } | null>(null);
  const pasteCleanupRef = useRef<(() => void) | null>(null);
  const keyboardPausedRef = useRef(false);
  const zoomModeRef = useRef<ZoomMode>("fit");
  const connectAttemptRef = useRef(0);
  const clientWasConnectedRef = useRef(false);
  const savedAuthRef = useRef<{ username: string; password: string }>({ username: "", password: "" });
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobile = useIsMobile();
  const isTouchDevice = useIsTouchDevice();
  const [state, setState] = useState<ViewerState>(
    hasStoredCredential ? "connecting" : "auth",
  );
  const [error, setError] = useState("");
  const [username, setUsername] = useState(defaultUsername || "");
  const [password, setPassword] = useState("");
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [sshOpen, setSshOpen] = useState(false);
  const [sshEverOpened, setSshEverOpened] = useState(false);
  const [sshFocused, setSshFocused] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<"desktop" | "ssh">("desktop");
  const [portForwardOpen, setPortForwardOpen] = useState(false);
  const [portForwards, setPortForwards] = useState<PortForward[]>([]);
  const [portForwardTunnelWs, setPortForwardTunnelWs] = useState<WebSocket | null>(null);
  const portForwardTunnelWsRef = useRef<WebSocket | null>(null);
  portForwardTunnelWsRef.current = portForwardTunnelWs;
  const [pasteText, setPasteText] = useState("");
  const [remoteClipboard, setRemoteClipboard] = useState("");

  const usernameRef = useRef(username);
  const passwordRef = useRef(password);
  usernameRef.current = username;
  passwordRef.current = password;

  const protocolLabel = protocol.toUpperCase();

  const [prevSshOpen, setPrevSshOpen] = useState(sshOpen);
  if (sshOpen !== prevSshOpen) {
    setPrevSshOpen(sshOpen);
    setActiveMobileTab(sshOpen ? "ssh" : "desktop");
  }

  const closePortForwardTunnel = useCallback(() => {
    portForwardTunnelWsRef.current?.close();
    portForwardTunnelWsRef.current = null;
    setPortForwardTunnelWs(null);
    setPortForwards([]);
  }, []);

  const resetSidePanels = useCallback(() => {
    setSshOpen(false);
    setSshEverOpened(false);
    setPortForwardOpen(false);
    setClipboardOpen(false);
  }, []);

  const getDisplaySize = useCallback(() => {
    const el = desktopPaneRef.current;
    const width = el ? Math.max(400, el.clientWidth) : Math.max(800, window.innerWidth);
    const height = el ? Math.max(300, el.clientHeight) : Math.max(600, window.innerHeight - 120);
    return { width, height };
  }, []);

  const relayout = useCallback(() => {
    if (!clientRef.current || !containerRef.current) return;
    applyDisplayLayout(
      clientRef.current.getDisplay(),
      containerRef.current,
      zoomModeRef.current,
    );
  }, []);

  const relayoutAfterLayout = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(relayout);
    });
  }, [relayout]);

  const sendRemoteSize = useCallback(() => {
    if (!clientRef.current) return;
    const { width, height } = getDisplaySize();
    clientRef.current.sendSize(width, height);
  }, [getDisplaySize]);

  const handlePaneResize = useCallback(
    (includeRemoteResize: boolean) => {
      if (!clientRef.current || state !== "connected") return;
      if (includeRemoteResize || zoomModeRef.current === "actual") {
        sendRemoteSize();
      }
      relayoutAfterLayout();
    },
    [relayoutAfterLayout, sendRemoteSize, state],
  );

  const teardownClient = useCallback(() => {
    pasteCleanupRef.current?.();
    pasteCleanupRef.current = null;
    displayElRef.current = null;
    tunnelRef.current = null;
    if (keyboardRef.current) {
      keyboardRef.current.onkeydown = null;
      keyboardRef.current.onkeyup = null;
      keyboardRef.current = null;
    }
    clientRef.current?.disconnect();
    clientRef.current = null;
  }, []);

  const disconnectOnLeave = useCallback(() => {
    connectAttemptRef.current += 1;
    resetSidePanels();
    closePortForwardTunnel();
    teardownClient();
    void fetch(
      quickSessionId
        ? `/api/history/end-quick/${quickSessionId}`
        : `/api/history/end-connection/${connectionId}`,
      { method: "POST", keepalive: true },
    );
  }, [closePortForwardTunnel, connectionId, quickSessionId, resetSidePanels, teardownClient]);

  useDisconnectOnLeave(disconnectOnLeave);

  const endSession = useCallback(
    (message?: string) => {
      resetSidePanels();
      closePortForwardTunnel();
      if (message) setError((prev) => prev || message);
      setState("error");
    },
    [closePortForwardTunnel, resetSidePanels],
  );

  const connect = useCallback(
    async (auth?: { username?: string; password?: string }) => {
      const attempt = ++connectAttemptRef.current;
      clientWasConnectedRef.current = false;
      teardownClient();
      resetSidePanels();
      closePortForwardTunnel();
      setState("connecting");
      setError("");
      setRemoteClipboard("");

      const authUsername = auth?.username || usernameRef.current || defaultUsername || "";
      const authPassword = auth?.password ?? passwordRef.current;
      savedAuthRef.current = { username: authUsername, password: authPassword };

      const { width, height } = getDisplaySize();

      const res = await fetch("/api/guac/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(quickSessionId ? { quickSessionId } : { connectionId }),
          via: protocol,
          username: authUsername || undefined,
          password: authPassword,
          width,
          height,
        }),
      });

      if (attempt !== connectAttemptRef.current) return;

      let data: { token?: string; error?: string; needsAuth?: boolean };
      try {
        data = await res.json();
      } catch {
        setError(res.ok ? "Invalid server response" : `Connection failed (${res.status})`);
        setState("error");
        return;
      }
      if (!res.ok) {
        if (data.needsAuth) {
          setState("auth");
          setError(data.error || "Password required");
        } else {
          setError(data.error || "Failed to get connection token");
          setState("error");
        }
        return;
      }

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (attempt !== connectAttemptRef.current) return;

      if (!containerRef.current) {
        setError("Display container not ready");
        setState("error");
        return;
      }

      try {
        const Guacamole = (await import("guacamole-common-js")).default;
        guacRef.current = Guacamole;
        if (attempt !== connectAttemptRef.current) return;

        const tunnel: GuacTunnel = new Guacamole.WebSocketTunnel(wsUrl("/api/guac"));
        tunnelRef.current = tunnel;
        const client = new Guacamole.Client(tunnel);
        clientRef.current = client;

        const displayEl = client.getDisplay().getElement();
        displayEl.className = "guac-display";
        configureGuacDisplayElement(displayEl, `${connectionName} remote desktop`);
        displayElRef.current = displayEl;
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(displayEl);

        const display = client.getDisplay();
        display.onresize = () => {
          requestAnimationFrame(relayout);
        };

        const { State: ClientState } = Guacamole.Client;
        const { State: TunnelState } = Guacamole.Tunnel;

        client.onstatechange = (clientState: number) => {
          if (attempt !== connectAttemptRef.current) return;
          if (
            clientState === ClientState.WAITING ||
            clientState === ClientState.CONNECTED
          ) {
            clientWasConnectedRef.current = true;
            setState("connected");
            relayoutAfterLayout();
          }
          if (
            clientState === ClientState.DISCONNECTED &&
            clientWasConnectedRef.current
          ) {
            clientWasConnectedRef.current = false;
            resetSidePanels();
            setError((prev) => prev || "Remote desktop session ended");
            setState("auth");
          }
        };

        tunnel.onstatechange = (tunnelState: number) => {
          if (attempt !== connectAttemptRef.current) return;
          if (tunnelState === TunnelState.OPEN) {
            sendRemoteSize();
            tunnel.sendMessage("nop");
            relayoutAfterLayout();
          }
          if (tunnelState === TunnelState.CLOSED) {
            resetSidePanels();
            setError((prev) => prev || "Connection closed");
            setState("auth");
          }
        };

        tunnel.onerror = (status: { message?: string }) => {
          if (attempt !== connectAttemptRef.current) return;
          resetSidePanels();
          setError(status.message || "Desktop tunnel error");
          setState("auth");
        };

        client.onerror = (status: { message?: string }) => {
          if (attempt !== connectAttemptRef.current) return;
          resetSidePanels();
          setError(status.message || "Desktop connection failed");
          setState("auth");
        };

        installClipboardHandler(client, Guacamole, (text) => {
          if (attempt !== connectAttemptRef.current) return;
          setRemoteClipboard(text);
        });

        pasteCleanupRef.current?.();
        pasteCleanupRef.current = installPasteHandler(displayEl, client, Guacamole);

        installMouseHandlers(client, Guacamole, displayEl);

        const keyboard = new Guacamole.Keyboard(displayEl);
        keyboardRef.current = keyboard;
        keyboard.onkeydown = (keysym: number) => {
          if (!keyboardPausedRef.current) client.sendKeyEvent(1, keysym);
        };
        keyboard.onkeyup = (keysym: number) => {
          if (!keyboardPausedRef.current) client.sendKeyEvent(0, keysym);
        };

        client.connect(`token=${encodeURIComponent(data.token!)}`);
      } catch (err) {
        if (attempt !== connectAttemptRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to connect");
        setState("error");
      }
    },
    [
      connectionId,
      quickSessionId,
      closePortForwardTunnel,
      defaultUsername,
      endSession,
      getDisplaySize,
      protocol,
      relayout,
      relayoutAfterLayout,
      resetSidePanels,
      sendRemoteSize,
      teardownClient,
    ],
  );

  const connectRef = useRef(connect);
  connectRef.current = connect;

  useEffect(() => {
    zoomModeRef.current = zoomMode;
    if (zoomMode === "actual") {
      sendRemoteSize();
    }
    relayoutAfterLayout();
  }, [zoomMode, relayoutAfterLayout, sendRemoteSize]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (hasStoredCredential) {
      timeout = setTimeout(() => {
        void connectRef.current();
      }, 0);
    }
    return () => {
      clearTimeout(timeout);
      connectAttemptRef.current += 1;
      teardownClient();
    };
  }, [connectionId, quickSessionId, hasStoredCredential, teardownClient]);

  useEffect(() => {
    if (state !== "connected") return;
    const timer = setTimeout(() => {
      sendRemoteSize();
      relayoutAfterLayout();
    }, 50);
    return () => clearTimeout(timer);
  }, [state, sendRemoteSize, relayoutAfterLayout]);

  useEffect(() => {
    const pane = desktopPaneRef.current;
    if (!pane) return;

    const observer = new ResizeObserver(() => {
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = setTimeout(() => {
        handlePaneResize(false);
      }, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(pane);
    return () => {
      observer.disconnect();
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
    };
  }, [handlePaneResize]);

  useEffect(() => {
    relayoutAfterLayout();
  }, [sshOpen, relayoutAfterLayout]);

  useEffect(() => {
    function handleResize() {
      handlePaneResize(true);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handlePaneResize]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === sessionRef.current);
      handlePaneResize(true);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [handlePaneResize]);

  useEffect(() => {
    keyboardPausedRef.current = clipboardOpen || portForwardOpen || sshFocused;
  }, [clipboardOpen, portForwardOpen, sshFocused]);

  useEffect(() => {
    const el = terminalPaneRef.current;
    if (!el || !sshEverOpened) return;

    const onFocusIn = (e: FocusEvent) => {
      if (el.contains(e.target as Node)) setSshFocused(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (!next || !el.contains(next as Node)) setSshFocused(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (el.contains(e.target as Node)) setSshFocused(true);
    };

    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    el.addEventListener("pointerdown", onPointerDown);
    return () => {
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
      el.removeEventListener("pointerdown", onPointerDown);
    };
  }, [sshEverOpened, sshOpen]);

  const focusDesktop = useCallback(() => {
    displayElRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state !== "connected" || !tunnelRef.current) return;
    const interval = setInterval(() => {
      if (tunnelRef.current) {
        tunnelRef.current.sendMessage("nop");
      }
    }, KEEPALIVE_MS);
    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    if (!portForwardOpen && !clipboardOpen) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (portForwardOpen && portOverlayRef.current && !portOverlayRef.current.contains(target)) {
        setPortForwardOpen(false);
      }
      if (clipboardOpen && clipboardOverlayRef.current && !clipboardOverlayRef.current.contains(target)) {
        setClipboardOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [portForwardOpen, clipboardOpen]);

  const toggleFullscreen = useCallback(async () => {
    const el = sessionRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  }, []);

  const handleSendToRemote = useCallback(() => {
    if (!clientRef.current || !guacRef.current || !pasteText.trim()) return;
    sendTextToRemote(clientRef.current, guacRef.current, pasteText);
    setPasteText("");
    containerRef.current?.focus();
  }, [pasteText]);

  const handleCopyLocalClipboard = useCallback(async () => {
    if (!clientRef.current || !guacRef.current) return;
    try {
      const text = await navigator.clipboard.readText();
      setPasteText(text);
      sendTextToRemote(clientRef.current, guacRef.current, text);
    } catch {
      setError("Could not read local clipboard — allow clipboard access or use the panel");
    }
  }, []);

  const handleCtrlAltDel = useCallback(() => {
    if (clientRef.current) sendCtrlAltDel(clientRef.current);
  }, []);

  const handleReconnect = useCallback(() => {
    connect(savedAuthRef.current);
  }, [connect]);

  const handleDisconnect = useCallback(() => {
    connectAttemptRef.current += 1;
    teardownClient();
    resetSidePanels();
    closePortForwardTunnel();
    setState("auth");
    void fetch(
      quickSessionId
        ? `/api/history/end-quick/${quickSessionId}`
        : `/api/history/end-connection/${connectionId}`,
      { method: "POST", keepalive: true },
    );
  }, [closePortForwardTunnel, connectionId, quickSessionId, resetSidePanels, teardownClient]);

  const handleToggleSsh = useCallback(() => {
    setSshOpen((open) => {
      if (!open) setSshEverOpened(true);
      return !open;
    });
  }, []);

  const handleTogglePortForward = useCallback(() => {
    setPortForwardOpen((open) => !open);
  }, []);

  const handleToggleClipboard = useCallback(() => {
    setClipboardOpen((open) => !open);
  }, []);

  const sendGuacBackspace = useCallback(() => {
    focusDesktop();
    if (clientRef.current) {
      clientRef.current.sendKeyEvent(1, 0xff08);
      clientRef.current.sendKeyEvent(0, 0xff08);
    }
  }, [focusDesktop]);

  usePreventBackspaceNavigation(
    state === "connected" && !sshFocused,
    sendGuacBackspace,
  );

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-zinc-950 text-zinc-500 text-sm">
        Loading session...
      </div>
    );
  }

  const showAuth = state === "auth" || state === "error";
  const portWarning = isLikelyWrongVncPort(protocol, port)
    ? `Port ${port} is unusual for VNC (expected 5900 or your host's VNC port).`
    : null;
  const needsUsername = protocol === "rdp";
  const showVncUsername = protocol === "vnc";

  const desktopView = (
    <div
      ref={desktopPaneRef}
      className="relative flex h-full min-h-0 flex-col"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        focusDesktop();
      }}
    >
      {state === "connecting" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/80">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      )}

      {state === "error" && !showAuth && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center">
            <p className="text-red-400">{error || "Connection failed"}</p>
            <Button onClick={() => connect({ username, password })}>Retry</Button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className={`guac-container min-h-0 flex-1 bg-black ${showAuth ? "invisible" : ""}`}
      />
    </div>
  );

  const sshPane =
    hasSshAccess && sshEverOpened ? (
      <div
        ref={terminalPaneRef}
        className={`h-full min-h-0 border-l border-zinc-800 select-text ${sshOpen ? "" : "hidden"}`}
      >
        <SshTerminal
          key={`${effectiveSshConnectionId}-ssh`}
          connectionId={effectiveSshConnectionId}
          connectionName={effectiveSshConnectionName}
          hostname={hostname}
          defaultUsername={sshDefaultUsername}
          hasStoredCredential={sshHasStoredCredential}
          variant="embedded"
          chromeless
          autoFocusOnConnect={false}
          paneVisible={sshOpen}
          sizeContainerRef={terminalPaneRef}
          onClose={() => setSshOpen(false)}
        />
      </div>
    ) : null;

  const sessionEndpoint = `${hostname}:${port}`;
  const sessionStatus =
    state === "connected" ? "connected"
    : state === "connecting" ? "connecting"
    : "disconnected";

  const sessionToolbar =
    state === "connected" ?
      <DesktopToolbar
        protocol={protocol}
        zoomMode={zoomMode}
        isFullscreen={isFullscreen}
        clipboardOpen={clipboardOpen}
        onZoomModeChange={setZoomMode}
        onToggleFullscreen={toggleFullscreen}
        onToggleClipboard={handleToggleClipboard}
        onCopyLocalClipboard={handleCopyLocalClipboard}
        onCtrlAltDel={handleCtrlAltDel}
        onReconnect={handleReconnect}
        onDisconnect={handleDisconnect}
        onFocusDesktop={focusDesktop}
        sshOpen={sshOpen}
        portForwardOpen={portForwardOpen}
        onToggleSsh={hasSshAccess ? handleToggleSsh : undefined}
        onTogglePortForward={hasSshAccess ? handleTogglePortForward : undefined}
        hasSshConnection={hasSshAccess}
      />
    : undefined;

  const sessionBody = (
    <div ref={sessionRef} className="relative flex h-full min-h-0 flex-1 flex-col bg-background">
      {portWarning && state !== "auth" && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {portWarning}
        </div>
      )}

      {clipboardOpen && state === "connected" && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-4">
          <div
            ref={clipboardOverlayRef}
            className="pointer-events-auto w-full max-w-2xl rounded-lg border border-border bg-card p-4 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Clipboard</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-muted-foreground"
                onClick={() => setClipboardOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-muted">Send to remote</p>
                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste or type text to send to the remote clipboard…"
                  rows={4}
                  className="resize-none font-mono text-sm"
                />
                <Button size="sm" onClick={handleSendToRemote} disabled={!pasteText.trim()}>
                  Send to remote
                </Button>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted">From remote</p>
                <Textarea
                  readOnly
                  value={remoteClipboard}
                  placeholder="Remote clipboard content appears here…"
                  rows={4}
                  className="resize-none bg-background font-mono text-sm text-muted-foreground"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {portForwardOpen && hasSshAccess && effectiveSshConnectionId && state === "connected" && (
        <div className="pointer-events-none absolute inset-x-0 top-10 z-30 flex justify-center px-4">
          <div
            ref={portOverlayRef}
            className="pointer-events-auto w-full max-w-2xl rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
          >
            <PortForwardPanel
              connectionId={effectiveSshConnectionId}
              connectionName={effectiveSshConnectionName}
              defaultUsername={sshDefaultUsername}
              hasStoredCredential={sshHasStoredCredential}
              remoteHostname={hostname}
              forwards={portForwards}
              onForwardsChange={setPortForwards}
              persistTunnel
              tunnelWebSocket={portForwardTunnelWs}
              onTunnelWebSocketChange={setPortForwardTunnelWs}
              isActive
              onClose={() => setPortForwardOpen(false)}
            />
          </div>
        </div>
      )}

      {showAuth && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              connect({ username, password });
            }}
            className="w-full max-w-md space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6"
          >
            <h2 className="text-lg font-medium text-zinc-100">{protocolLabel} Authentication</h2>
            {portWarning && (
              <p className="text-sm text-amber-300">{portWarning}</p>
            )}
            {needsUsername && (
              <div className="space-y-2">
                <Label htmlFor="desktop-username" className="text-zinc-300">
                  Username
                </Label>
                <Input
                  id="desktop-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="border-zinc-700 bg-zinc-800 text-zinc-100"
                />
              </div>
            )}
            {showVncUsername && (
              <div className="space-y-2">
                <Label htmlFor="desktop-username" className="text-zinc-300">
                  Username <span className="text-zinc-500">(optional on some VNC servers)</span>
                </Label>
                <Input
                  id="desktop-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={defaultUsername || "e.g. act"}
                  className="border-zinc-700 bg-zinc-800 text-zinc-100"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="desktop-password" className="text-zinc-300">
                Password
              </Label>
              <Input
                id="desktop-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-zinc-700 bg-zinc-800 text-zinc-100"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit">Connect</Button>
          </form>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {isMobile && !!sshOpen && hasSshAccess && sshEverOpened ? (
          <div className="flex h-full flex-col min-h-0">
            <div className="flex border-b border-zinc-800 bg-zinc-900/90 px-2 shrink-0">
              <button
                className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${activeMobileTab === "desktop"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                  }`}
                onClick={() => setActiveMobileTab("desktop")}
              >
                Desktop
              </button>
              <button
                className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${activeMobileTab === "ssh"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                  }`}
                onClick={() => setActiveMobileTab("ssh")}
              >
                SSH Terminal
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              {activeMobileTab === "desktop" ? desktopView : sshPane}
            </div>
          </div>
        ) : (
          <SplitPane
            direction="horizontal"
            initialRatio={0.68}
            showSecondary={!!sshOpen && hasSshAccess && sshEverOpened}
            primary={desktopView}
            secondary={sshPane}
          />
        )}
      </div>
    </div>
  );

  if (chromeless) {
    return sessionBody;
  }

  return (
    <SessionLayout
      title={connectionName}
      protocol={protocol}
      endpoint={sessionEndpoint}
      status={sessionStatus}
      toolbar={sessionToolbar}
    >
      {sessionBody}
    </SessionLayout>
  );
}
