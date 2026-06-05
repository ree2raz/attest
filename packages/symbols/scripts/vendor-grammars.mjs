// Vendor prebuilt tree-sitter grammar wasm into grammars/ so @attest/symbols is
// self-contained at runtime (no reaching into another package's dist). Run via
// `pnpm --filter @attest/symbols vendor-grammars` whenever tree-sitter-wasms bumps.
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "grammars");
mkdirSync(outDir, { recursive: true });

// Resolve the tree-sitter-wasms package directory, then its out/ wasm bundle.
const pkgJson = require.resolve("tree-sitter-wasms/package.json");
const srcDir = join(dirname(pkgJson), "out");

const grammars = [
  "tree-sitter-typescript.wasm",
  "tree-sitter-tsx.wasm",
  "tree-sitter-python.wasm",
  "tree-sitter-go.wasm",
];

for (const file of grammars) {
  copyFileSync(join(srcDir, file), join(outDir, file));
  console.log(`vendored ${file}`);
}
