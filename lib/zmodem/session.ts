/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
"use client";

const Zmodem = require("zmodem.js");

export type ZmodemActiveHandler = (active: boolean) => void;

export interface ZmodemBridge {
  sendRaw: (data: Uint8Array | string) => void;
  sendControl: (payload: Record<string, unknown>) => void;
  writeTerminal: (data: string | Uint8Array) => void;
}

export function createZmodemSentry(bridge: ZmodemBridge, onActive: ZmodemActiveHandler) {
  let session: any = null;

  const sentry = new Zmodem.Sentry({
    to_terminal: (octets: number[]) => {
      bridge.writeTerminal(new Uint8Array(octets));
    },
    on_detect: (detection: any) => {
      onActive(true);
      bridge.sendControl({ type: "zmodem-start", direction: "receive" });

      const zsession = detection.confirm();
      session = zsession;

      if (detection.get_session_role() === "receive") {
        zsession.on("offer", async (offer: any) => {
          offer.accept();
          const xfer = await offer.accept();
          const payload = await xfer.get_payload();
          const details = offer.get_details();
          const blob = new Blob([payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)]);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = details.name || "download";
          a.click();
          URL.revokeObjectURL(url);
        });
        zsession.on("session_end", () => {
          onActive(false);
          bridge.sendControl({ type: "zmodem-end" });
          session = null;
        });
      }
    },
    on_retract: () => {
      onActive(false);
      bridge.sendControl({ type: "zmodem-end" });
    },
    sender: (octets: number[]) => {
      bridge.sendRaw(new Uint8Array(octets));
    },
  });

  return {
    consume(data: Uint8Array | string) {
      const bytes =
        typeof data === "string"
          ? Uint8Array.from(data, (c) => c.charCodeAt(0))
          : data;
      sentry.consume(bytes);
    },
    async sendFile(file: File, bridgeRef: ZmodemBridge) {
      onActive(true);
      bridgeRef.sendControl({ type: "zmodem-start", direction: "send" });
      bridgeRef.writeTerminal("sz\r");

      await new Promise((r) => setTimeout(r, 500));

      const offer = {
        name: file.name,
        size: file.size,
        mtime: Math.floor(Date.now() / 1000),
      };

      const zsession = new Zmodem.Session.Send();
      session = zsession;

      zsession.on("session_end", () => {
        onActive(false);
        bridgeRef.sendControl({ type: "zmodem-end" });
        session = null;
      });

      const buffer = await file.arrayBuffer();
      await zsession.send_offer(offer);
      zsession.send_file(new Uint8Array(buffer));
      zsession.close();
    },
    cancel() {
      session?.close();
      session = null;
      onActive(false);
      bridge.sendControl({ type: "zmodem-end" });
    },
  };
}

export async function startReceive(bridge: ZmodemBridge) {
  bridge.sendControl({ type: "zmodem-start", direction: "receive" });
  bridge.writeTerminal("rz\r");
}
