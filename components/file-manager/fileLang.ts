import { loadLanguage } from "@uiw/codemirror-extensions-langs";
import type { Extension } from "@codemirror/state";

const EXT_MAP: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  cs: "csharp",
  php: "php",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "sass",
  less: "less",
  json: "json",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  markdown: "markdown",
  vue: "vue",
  svelte: "svelte",
  toml: "toml",
  ini: "ini",
  dockerfile: "docker",
  env: "properties",
};

export function languageExtension(filename: string): Extension[] {
  const base = filename.toLowerCase();
  const ext = base.split(".").pop() || "";
  const langKey =
    EXT_MAP[ext] ||
    (["dockerfile", "makefile", "gemfile", "rakefile"].includes(base) ? base : "text");
  const lang = loadLanguage(langKey as Parameters<typeof loadLanguage>[0]);
  return lang ? [lang] : [];
}
