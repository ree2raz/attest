import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyFileDiff, changedPaths, findFile, parseDiff } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const corpusRoot = join(repoRoot, "corpus");

interface Case {
  lang: string;
  name: string;
  baseDir: string;
  caseDir: string;
}

function discoverCases(): Case[] {
  const cases: Case[] = [];
  for (const lang of ["ts", "py", "go"]) {
    const casesRoot = join(corpusRoot, lang, "cases");
    if (!existsSync(casesRoot)) continue;
    for (const name of readdirSync(casesRoot)) {
      const caseDir = join(casesRoot, name);
      if (!existsSync(join(caseDir, "change.diff"))) continue;
      cases.push({ lang, name, baseDir: join(corpusRoot, lang, "base"), caseDir });
    }
  }
  return cases;
}

const cases = discoverCases();

describe("corpus diffs (regression oracle)", () => {
  it("discovers the fixture cases", () => {
    // Guard against silently testing nothing if the corpus path ever moves.
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const c of cases) {
    describe(`${c.lang}/${c.name}`, () => {
      const diffText = readFileSync(join(c.caseDir, "change.diff"), "utf8");
      const parsed = parseDiff(diffText);

      it("parses at least one file change", () => {
        expect(parsed.files.length).toBeGreaterThan(0);
      });

      it("every parsed path is findable and matches changedPaths", () => {
        const paths = changedPaths(parsed);
        expect(paths.length).toBe(parsed.files.length);
        for (const p of paths) {
          expect(findFile(parsed, p)).toBeDefined();
        }
      });

      it("reconstructs each created/modified file to match the overlay (base + diff = post)", () => {
        for (const file of parsed.files) {
          if (file.op === "delete") continue;

          const baseFile = join(c.baseDir, file.path);
          const baseContent =
            file.op === "modify" && existsSync(baseFile) ? readFileSync(baseFile, "utf8") : "";

          const overlayFile = join(c.caseDir, "overlay", file.path);
          // Every non-delete change must materialize a post-change file in overlay/.
          expect(existsSync(overlayFile), `missing overlay for ${file.path}`).toBe(true);
          const expected = readFileSync(overlayFile, "utf8");

          expect(applyFileDiff(baseContent, file), `reconstruction mismatch for ${file.path}`).toBe(
            expected,
          );
        }
      });
    });
  }
});
