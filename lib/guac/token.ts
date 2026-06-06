import { createRequire } from "module";
import { getGuacClientOptions } from "./config";
import type { GuacProtocol } from "../protocols";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Crypt = require("guacamole-lite/lib/Crypt") as new (
  cypher: string,
  key: string | Buffer,
) => { encrypt: (data: unknown) => string };

export interface GuacTokenMeta {
  connectionId: string | null;
  quickSessionId?: string | null;
  userId: string;
  workspace_id: string | null;
  connectionName: string;
  hostname: string;
  protocol: GuacProtocol;
}

export interface GuacTokenPayload {
  connection: {
    type: GuacProtocol;
    settings: Record<string, string | number | boolean>;
  };
  meta: GuacTokenMeta;
}

export function encryptGuacToken(payload: GuacTokenPayload): string {
  const { crypt } = getGuacClientOptions();
  const cryptInstance = new Crypt(crypt.cypher, crypt.key);
  return cryptInstance.encrypt(payload);
}
