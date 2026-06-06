declare module "guacamole-common-js" {
  interface GuacamoleStream {
    index: number;
  }

  interface GuacamoleStringReader {
    ontext: ((text: string) => void) | null;
    onend: (() => void) | null;
  }

  interface GuacamoleStringWriter {
    sendText: (text: string) => void;
    sendEnd: () => void;
  }

  interface GuacamoleDisplay {
    getElement: () => HTMLElement;
    getWidth: () => number;
    getHeight: () => number;
    getScale: () => number;
    scale: (scale: number) => void;
    onresize: ((width: number, height: number) => void) | null;
  }

  interface GuacamoleClient {
    connect: (params?: string) => void;
    disconnect: () => void;
    sendSize: (width: number, height: number) => void;
    sendMouseState: (state: unknown) => void;
    sendKeyEvent: (pressed: number, keysym: number) => void;
    sendAck: (index: number, message: string, code: number) => void;
    createClipboardStream: (mimetype: string) => GuacamoleStream;
    getDisplay: () => GuacamoleDisplay;
    onstatechange: ((state: number) => void) | null;
    onerror: ((status: { message?: string }) => void) | null;
    onclipboard: ((stream: GuacamoleStream, mimetype: string) => void) | null;
  }

  interface GuacamoleTunnel {
    onerror: ((status: { message?: string }) => void) | null;
    onstatechange: ((state: number) => void) | null;
    sendMessage: (...args: unknown[]) => void;
  }

  interface GuacamoleMouse {
    onEach: (events: string[], handler: (e: { state: unknown }) => void) => void;
  }

  interface GuacamoleKeyboard {
    onkeydown: ((keysym: number) => void) | null;
    onkeyup: ((keysym: number) => void) | null;
  }

  interface GuacamoleNamespace {
    Client: {
      State: {
        WAITING: number;
        CONNECTED: number;
        DISCONNECTING: number;
        DISCONNECTED: number;
      };
      new (tunnel: GuacamoleTunnel): GuacamoleClient;
    };
    Tunnel: {
      State: { OPEN: number; CLOSED: number };
    };
    WebSocketTunnel: new (url: string) => GuacamoleTunnel;
    Mouse: new (element: HTMLElement) => GuacamoleMouse;
    Keyboard: new (element: Document | HTMLElement) => GuacamoleKeyboard;
    StringReader: new (stream: GuacamoleStream) => GuacamoleStringReader;
    StringWriter: new (stream: GuacamoleStream) => GuacamoleStringWriter;
  }

  const Guacamole: GuacamoleNamespace;
  export default Guacamole;
}

declare module "guacamole-lite" {
  import { Server as HttpServer } from "http";
  import { EventEmitter } from "events";

  interface GuacamoleLiteOptions {
    server?: HttpServer;
    path?: string;
    port?: number;
    host?: string;
    noServer?: boolean;
  }

  interface GuacdOptions {
    host?: string;
    port?: number;
  }

  export default class GuacamoleLite extends EventEmitter {
    webSocketServer: {
      handleUpgrade: (
        req: import("http").IncomingMessage,
        socket: import("stream").Duplex,
        head: Buffer,
        callback: (ws: unknown) => void,
      ) => void;
      emit: (event: string, ...args: unknown[]) => boolean;
    };
    constructor(
      wsOptions: GuacamoleLiteOptions,
      guacdOptions?: GuacdOptions,
      clientOptions?: Record<string, unknown>,
      callbacks?: Record<string, unknown>,
    );
  }
}
