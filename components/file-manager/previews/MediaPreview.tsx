"use client";

interface MediaPreviewProps {
  content: string;
  encoding: "utf8" | "base64";
  filename: string;
  kind: "audio" | "video";
}

function mimeFor(filename: string, kind: "audio" | "video"): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const audio: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    aac: "audio/aac",
    flac: "audio/flac",
    m4a: "audio/mp4",
  };
  const video: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
  };
  return (kind === "audio" ? audio : video)[ext] || "application/octet-stream";
}

export function MediaPreview({ content, encoding, filename, kind }: MediaPreviewProps) {
  const mime = mimeFor(filename, kind);
  const src =
    encoding === "base64"
      ? `data:${mime};base64,${content}`
      : `data:${mime};base64,${btoa(content)}`;

  if (kind === "audio") {
    return (
      <div className="flex h-full items-center justify-center p-4">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={src} className="w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video controls src={src} className="max-h-full max-w-full" />
    </div>
  );
}
