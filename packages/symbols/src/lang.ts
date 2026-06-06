import type { Lang } from "./types.js";

/**
 * Map a file path to a Phase-1 language by extension, or null if unsupported.
 * The TypeScript grammar parses JavaScript, so `.js`/`.mjs`/`.cjs` route to `ts`
 * and `.jsx` to `tsx` — structurally sufficient for symbol extraction.
 */
const EXT_TO_LANG: Record<string, Lang> = {
  ts: "ts",
  mts: "ts",
  cts: "ts",
  js: "ts",
  mjs: "ts",
  cjs: "ts",
  tsx: "tsx",
  jsx: "tsx",
  py: "py",
  pyi: "py",
  go: "go",
};

export function langFromPath(path: string): Lang | null {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = path.slice(dot + 1).toLowerCase();
  return EXT_TO_LANG[ext] ?? null;
}
