#!/usr/bin/env node
// WU11: copy the vendored tree-sitter WASM grammars from @attest/symbols into
// the CLI's published tree (`grammars/`) so the bundled CLI can find them at
// runtime via `<cli>/grammars/...`. The symbols package's `setGrammarsDir` is
// called from the CLI's startup to point at this directory.
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "..", "symbols", "grammars");
const dst = join(__dirname, "..", "grammars");

await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log(`copied grammars: ${src} -> ${dst}`);
