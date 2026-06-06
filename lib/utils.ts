import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export { defaultPort } from "./protocols";
export type { ConnectionProtocol, GuacProtocol } from "./protocols";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function wsUrl(path: string): string {
  if (typeof window === "undefined") return path;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}
