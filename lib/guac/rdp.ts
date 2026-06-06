/* eslint-disable @typescript-eslint/no-explicit-any */

const KEYSYM_CTRL = 65507;
const KEYSYM_ALT = 65513;
const KEYSYM_DELETE = 65535;

export function sendCtrlAltDel(client: any): void {
  client.sendKeyEvent(1, KEYSYM_CTRL);
  client.sendKeyEvent(1, KEYSYM_ALT);
  client.sendKeyEvent(1, KEYSYM_DELETE);
  client.sendKeyEvent(0, KEYSYM_DELETE);
  client.sendKeyEvent(0, KEYSYM_ALT);
  client.sendKeyEvent(0, KEYSYM_CTRL);
}
