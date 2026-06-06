"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewProps {
  content: string;
  editMode: boolean;
  onEditModeChange: (edit: boolean) => void;
}

export function MarkdownPreview({ content, editMode, onEditModeChange }: MarkdownPreviewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-2 border-b border-zinc-800 px-2 py-1">
        <button
          type="button"
          className={`text-xs ${!editMode ? "text-sky-400" : "text-zinc-500"}`}
          onClick={() => onEditModeChange(false)}
        >
          Preview
        </button>
        <button
          type="button"
          className={`text-xs ${editMode ? "text-sky-400" : "text-zinc-500"}`}
          onClick={() => onEditModeChange(true)}
        >
          Source
        </button>
      </div>
      {!editMode ? (
        <div className="prose prose-invert max-w-none flex-1 overflow-auto p-4 prose-pre:bg-zinc-900">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <pre className="flex-1 overflow-auto p-4 font-mono text-sm text-zinc-300">{content}</pre>
      )}
    </div>
  );
}
