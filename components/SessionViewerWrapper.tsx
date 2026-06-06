"use client";

import dynamic from "next/dynamic";

export const SshSessionViewer = dynamic(
  () => import("./SshSessionViewer").then((mod) => mod.SshSessionViewer),
  { ssr: false }
);

export const GuacamoleViewer = dynamic(
  () => import("./GuacamoleViewer").then((mod) => mod.GuacamoleViewer),
  { ssr: false }
);
