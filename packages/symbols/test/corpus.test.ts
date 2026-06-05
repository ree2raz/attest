import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractSymbols, langFromPath, locateSymbol } from "../src/index.js";
import type { SymbolKind } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const corpusRoot = join(repoRoot, "corpus");

interface SymbolClaim {
  path: string;
  symbol: string;
  symbol_kind: SymbolKind;
}

interface Manifest {
  claims: Array<Record<string, unknown>>;
}

function asSymbolAdded(claim: Record<string, unknown>): SymbolClaim | null {
  if (claim["kind"] !== "symbol_added") return null;
  return {
    path: String(claim["path"]),
    symbol: String(claim["symbol"]),
    symbol_kind: claim["symbol_kind"] as SymbolKind,
  };
}

// The honest fixtures declare changes that are genuinely present, so every
// symbol_added claim must resolve in the post-change (overlay) source. This grounds
// extraction against real TS/Py/Go files; the lying/partial cases are the engine's
// job (WU5/WU9), not this package's.
const honestCases = ["ts", "py", "go"].map((lang) => ({
  lang,
  manifestPath: join(corpusRoot, lang, "cases", "honest", "manifest.json"),
  overlayDir: join(corpusRoot, lang, "cases", "honest", "overlay"),
}));

describe("corpus honest cases — declared added symbols exist in the post source", () => {
  for (const c of honestCases) {
    it(`${c.lang}/honest`, async () => {
      expect(existsSync(c.manifestPath), `missing manifest for ${c.lang}`).toBe(true);
      const manifest = JSON.parse(readFileSync(c.manifestPath, "utf8")) as Manifest;

      const symbolClaims = manifest.claims
        .map(asSymbolAdded)
        .filter((cl): cl is SymbolClaim => cl !== null);
      expect(symbolClaims.length, `${c.lang}/honest has no symbol_added claim`).toBeGreaterThan(0);

      for (const claim of symbolClaims) {
        const lang = langFromPath(claim.path);
        expect(lang, `unsupported lang for ${claim.path}`).not.toBeNull();

        const source = readFileSync(join(c.overlayDir, claim.path), "utf8");
        const syms = await extractSymbols(lang!, source);
        const found = locateSymbol(syms, claim.symbol, claim.symbol_kind);
        expect(
          found,
          `${claim.symbol} (${claim.symbol_kind}) not found in ${claim.path}`,
        ).toBeDefined();
      }
    });
  }
});
