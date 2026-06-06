/* eslint-disable @typescript-eslint/no-explicit-any */

function isTextMime(mimetype: string): boolean {
  return mimetype.startsWith("text/") || mimetype === "TEXT/plain";
}

export function installClipboardHandler(
  client: any,
  Guacamole: any,
  onRemoteText: (text: string) => void,
): void {
  client.onclipboard = (stream: any, mimetype: string) => {
    if (!isTextMime(mimetype)) {
      client.sendAck(stream.index, "Unsupported clipboard type", 0x0100);
      return;
    }

    const reader = new Guacamole.StringReader(stream);
    let data = "";
    reader.ontext = (text: string) => {
      data += text;
    };
    reader.onend = () => {
      onRemoteText(data);
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(data).catch(() => {});
      }
    };
  };
}

export function sendTextToRemote(client: any, Guacamole: any, text: string): void {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  const stream = client.createClipboardStream("text/plain");
  const writer = new Guacamole.StringWriter(stream);
  writer.sendText(normalized);
  writer.sendEnd();
}

export function installPasteHandler(
  displayEl: HTMLElement,
  client: any,
  Guacamole: any,
): () => void {
  const onPaste = (event: ClipboardEvent) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain");
    if (text) sendTextToRemote(client, Guacamole, text);
  };

  const onCopy = (event: ClipboardEvent) => {
    const selection = window.getSelection()?.toString();
    if (selection && event.clipboardData) {
      event.clipboardData.setData("text/plain", selection);
      event.preventDefault();
    }
  };

  displayEl.addEventListener("paste", onPaste);
  displayEl.addEventListener("copy", onCopy);
  displayEl.setAttribute("tabindex", "0");

  return () => {
    displayEl.removeEventListener("paste", onPaste);
    displayEl.removeEventListener("copy", onCopy);
  };
}
