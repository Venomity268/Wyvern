"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { SplitPane } from "@/components/SplitPane";
import { FileBrowser } from "./FileBrowser";
import { FileEditorPane } from "./FileEditorPane";
import { SudoDialog } from "./SudoDialog";
import { useFileManager } from "./hooks/useFileManager";
import type { SessionAuth } from "./hooks/useSftpClient";

interface FileManagerPanelProps {
  connectionId?: string;
  quickSessionId?: string;
  defaultUsername?: string | null;
  hasStoredCredential: boolean;
  sessionAuth?: SessionAuth | null;
  onClose?: () => void;
}

export function FileManagerPanel({
  connectionId,
  quickSessionId,
  defaultUsername,
  hasStoredCredential,
  sessionAuth,
  onClose,
}: FileManagerPanelProps) {
  const fm = useFileManager(connectionId, quickSessionId, hasStoredCredential, sessionAuth);
  const [username, setUsername] = useState(defaultUsername || sessionAuth?.username || "");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [authMethod, setAuthMethod] = useState<"password" | "privateKey">("password");

  if (fm.needsAuth && !fm.ready) {
    return (
      <div className="h-full overflow-auto p-3">
        <p className="mb-3 text-sm font-medium text-zinc-100">Files</p>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-zinc-400">Username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="border-zinc-700 bg-zinc-800 text-zinc-100"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-zinc-400">Method</Label>
            <select
              value={authMethod}
              onChange={(e) => setAuthMethod(e.target.value as "password" | "privateKey")}
              className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100"
            >
              <option value="password">Password</option>
              <option value="privateKey">Private Key</option>
            </select>
          </div>
          {authMethod === "password" ? (
            <div className="space-y-1">
              <Label className="text-zinc-400">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-zinc-700 bg-zinc-800 text-zinc-100"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-zinc-400">Private Key</Label>
              <Textarea
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                rows={4}
                className="border-zinc-700 bg-zinc-800 font-mono text-xs text-zinc-100"
              />
            </div>
          )}
          {fm.error && <p className="text-sm text-red-400">{fm.error}</p>}
          <Button
            size="sm"
            onClick={() =>
              void fm.connect({
                username: username || undefined,
                password: authMethod === "password" ? password : undefined,
                privateKey: authMethod === "privateKey" ? privateKey : undefined,
              })
            }
            disabled={fm.connecting}
          >
            {fm.connecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Connect
          </Button>
        </div>
      </div>
    );
  }

  if (fm.connecting && !fm.ready) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-3 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Connecting…
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <SplitPane
        direction="horizontal"
        initialRatio={0.4}
        minPrimary={160}
        minSecondary={200}
        showSecondary
        primary={<FileBrowser fm={fm} onClose={onClose} />}
        secondary={
          <FileEditorPane
            fm={fm}
            file={fm.openFile}
            onClose={() => fm.setOpenFile(null)}
          />
        }
      />
      <SudoDialog
        open={fm.sudoOpen}
        onSubmit={(pwd) => fm.resolveSudo(pwd)}
        onCancel={() => fm.resolveSudo(null)}
      />
    </div>
  );
}
