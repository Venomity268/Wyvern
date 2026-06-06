import { GhosttyCore } from "@wterm/ghostty";

const WASM_PATH = "/ghostty-vt.wasm";

/** Each call creates an isolated GhosttyCore (own WASM memory). */
export function createGhosttyCore(): Promise<GhosttyCore> {
  return GhosttyCore.load({ wasmPath: WASM_PATH });
}
