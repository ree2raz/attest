import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "web-tree-sitter";
import type { Lang } from "./types.js";

/**
 * tree-sitter runtime loading. WASM grammars (web-tree-sitter) — no native
 * compilation, deterministic, portable. Grammars are vendored under `grammars/`
 * (see scripts/vendor-grammars.mjs) so the package is self-contained at runtime.
 *
 * `grammars/` sits one level above both `src/` (vitest) and `dist/` (built), so
 * the same relative path resolves in either case.
 */
const grammarsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "grammars");

const GRAMMAR_FILE: Record<Lang, string> = {
  ts: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  py: "tree-sitter-python.wasm",
  go: "tree-sitter-go.wasm",
};

let initPromise: Promise<void> | null = null;
const langCache = new Map<Lang, Promise<Parser.Language>>();

function ensureInit(): Promise<void> {
  // web-tree-sitter's runtime must be initialized exactly once per process.
  initPromise ??= Parser.init();
  return initPromise;
}

function loadLanguage(lang: Lang): Promise<Parser.Language> {
  let cached = langCache.get(lang);
  if (!cached) {
    cached = (async () => {
      await ensureInit();
      const bytes = new Uint8Array(await readFile(join(grammarsDir, GRAMMAR_FILE[lang])));
      return Parser.Language.load(bytes);
    })();
    langCache.set(lang, cached);
  }
  return cached;
}

/** Parse `source` in `lang` to a tree-sitter tree. Grammars are cached per process. */
export async function parse(lang: Lang, source: string): Promise<Parser.Tree> {
  const language = await loadLanguage(lang);
  const parser = new Parser();
  parser.setLanguage(language);
  return parser.parse(source);
}

export type { Parser };
