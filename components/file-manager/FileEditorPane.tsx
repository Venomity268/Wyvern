"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import { searchKeymap } from "@codemirror/search";
import { Download, Loader2, RotateCcw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SFTP_MAX_EDIT_BYTES, SFTP_WARN_BYTES } from "@/lib/sftp/protocol";
import { languageExtension } from "./fileLang";
import type { FileManagerState, OpenFile } from "./hooks/useFileManager";
import { ImagePreview } from "./previews/ImagePreview";
import { PdfPreview } from "./previews/PdfPreview";
import { MediaPreview } from "./previews/MediaPreview";
import { MarkdownPreview } from "./previews/MarkdownPreview";
import { UnknownPreview } from "./previews/UnknownPreview";

interface FileEditorPaneProps {
  fm: FileManagerState;
  file: OpenFile | null;
  onClose: () => void;
}

const AUTO_SAVE_MS = 60_000;

export function FileEditorPane({ fm, file, onClose }: FileEditorPaneProps) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [encoding, setEncoding] = useState<"utf8" | "base64">("utf8");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mdPreview, setMdPreview] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = content !== savedContent;
  const isEditable = file && (file.kind === "text" || file.kind === "markdown");

  const loadFile = useCallback(async () => {
    if (!file || !fm.ready) return;
    setLoading(true);
    setError("");
    setMdPreview(false);
    try {
      const result = await fm.client.readText(file.path);
      if (result.tooLarge) {
        setError(`File exceeds ${SFTP_WARN_BYTES / (1024 * 1024)} MB limit for editing.`);
        return;
      }
      if (result.truncated) {
        setError(`File truncated to ${SFTP_MAX_EDIT_BYTES / (1024 * 1024)} MB for editing.`);
      }
      setContent(result.content);
      setSavedContent(result.content);
      setEncoding(result.encoding);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load file");
    } finally {
      setLoading(false);
    }
  }, [file, fm]);

  useEffect(() => {
    if (file) void loadFile();
    else {
      setContent("");
      setSavedContent("");
      setError("");
    }
  }, [file, loadFile]);

  const handleSave = useCallback(async () => {
    if (!file || !isEditable) return;
    setSaving(true);
    setError("");
    try {
      await fm.withSudo(() => fm.client.writeText(file.path, content));
      setSavedContent(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [content, file, fm, isEditable]);

  useEffect(() => {
    if (!dirty || !isEditable || !file) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      void handleSave();
    }, AUTO_SAVE_MS);
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    };
  }, [dirty, isEditable, file, content, handleSave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  const handleDownload = useCallback(async () => {
    if (!file) return;
    try {
      const data = await fm.client.download(file.path);
      const blob = new Blob([new Uint8Array(data)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }, [file, fm.client]);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        Double-click a file to open
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{file.name}</span>
        {dirty && <span className="text-xs text-amber-400">unsaved</span>}
        {isEditable && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
              title="Save (Ctrl+S)"
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => setContent(savedContent)}
              disabled={!dirty}
              title="Revert"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" className="h-7" onClick={() => void handleDownload()} title="Download">
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-zinc-400" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {error && <p className="shrink-0 px-2 py-1 text-xs text-red-400">{error}</p>}

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : file.kind === "image" ? (
          <ImagePreview content={content} encoding={encoding} filename={file.name} />
        ) : file.kind === "pdf" ? (
          <PdfPreview content={content} encoding={encoding} />
        ) : file.kind === "audio" || file.kind === "video" ? (
          <MediaPreview content={content} encoding={encoding} filename={file.name} kind={file.kind} />
        ) : file.kind === "markdown" && mdPreview ? (
          <MarkdownPreview
            content={content}
            editMode={false}
            onEditModeChange={() => setMdPreview(false)}
          />
        ) : file.kind === "markdown" ? (
          <div className="flex h-full flex-col">
            <div className="shrink-0 border-b border-zinc-800 px-2 py-1">
              <button type="button" className="text-xs text-sky-400" onClick={() => setMdPreview(true)}>
                Show preview
              </button>
            </div>
            <CodeMirror
              value={content}
              height="100%"
              theme={oneDark}
              extensions={[...languageExtension(file.name), keymap.of([...searchKeymap])]}
              onChange={setContent}
              className="h-full min-h-0 overflow-auto text-sm"
            />
          </div>
        ) : file.kind === "binary" ? (
          <UnknownPreview filename={file.name} size={file.size} onDownload={() => void handleDownload()} />
        ) : isEditable ? (
          <CodeMirror
            value={content}
            height="100%"
            theme={oneDark}
            extensions={[...languageExtension(file.name), keymap.of([...searchKeymap])]}
            onChange={setContent}
            className="h-full min-h-0 overflow-auto text-sm"
          />
        ) : (
          <UnknownPreview filename={file.name} size={file.size} onDownload={() => void handleDownload()} />
        )}
      </div>
    </div>
  );
}
