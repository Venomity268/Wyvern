"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPreviewProps {
  content: string;
  encoding: "utf8" | "base64";
}

export function PdfPreview({ content, encoding }: PdfPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [pages, setPages] = useState(0);

  useEffect(() => {
    const binary = encoding === "base64" ? content : btoa(content);
    const bytes = Uint8Array.from(atob(binary), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [content, encoding]);

  if (!url) return null;

  return (
    <div className="h-full overflow-auto p-4">
      <Document file={url} onLoadSuccess={(d) => setPages(d.numPages)}>
        {Array.from({ length: pages }, (_, i) => (
          <Page key={i + 1} pageNumber={i + 1} width={480} className="mb-4" />
        ))}
      </Document>
    </div>
  );
}
