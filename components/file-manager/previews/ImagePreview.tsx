"use client";

interface ImagePreviewProps {
  content: string;
  encoding: "utf8" | "base64";
  filename: string;
}

function mimeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    bmp: "image/bmp",
  };
  return map[ext] || "application/octet-stream";
}

export function ImagePreview({ content, encoding, filename }: ImagePreviewProps) {
  const src =
    encoding === "base64"
      ? `data:${mimeFor(filename)};base64,${content}`
      : content.startsWith("data:")
        ? content
        : `data:${mimeFor(filename)};base64,${btoa(content)}`;

  return (
    <div className="flex h-full items-center justify-center overflow-auto p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={filename} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
