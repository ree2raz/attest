import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDiff } from "@attest/diff";
import type { Manifest, Verdict } from "@attest/schema";
import { verify } from "../src/index.js";
import type { OutcomeResults } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const corpusRoot = join(repoRoot, "corpus");

interface Case {
  lang: string;
  name: string;
  caseDir: string;
  baseDir: string;
}

function discoverCases(): Case[] {
  const cases: Case[] = [];
  for (const lang of ["ts", "py", "go"]) {
    const casesRoot = join(corpusRoot, lang, "cases");
    if (!existsSync(casesRoot)) continue;
    for (const name of readdirSync(casesRoot)) {
      const caseDir = join(casesRoot, name);
      if (!existsSync(join(caseDir, "expected-verdict.json"))) continue;
      cases.push({ lang, name, caseDir, baseDir: join(corpusRoot, lang, "base") });
    }
  }
  return cases;
}

// Outcome results the runner (WU6) would produce: the honest repos pass; the
// outcome-fail repo's test command exits non-zero. Injected, since core never runs
// commands itself.
function outcomesFor(caseName: string): OutcomeResults {
  const testsPass = caseName !== "outcome-fail";
  return {
    tests_pass: { passed: testsPass, cmd: "test", exitCode: testsPass ? 0 : 1, durationMs: 10 },
    build_passes: { passed: true, cmd: "build", exitCode: 0, durationMs: 10 },
    lint_passes: { passed: true, cmd: "lint", exitCode: 0, durationMs: 10 },
  };
}

/** The "stable projection" the corpus asserts (corpus/README.md): no evidence, no exact reason text. */
function projectClaims(verdict: { claims: Verdict["claims"] }) {
  return verdict.claims.map((c) => ({ id: c.id, status: c.status }));
}

function projectUndeclared(verdict: { undeclared_changes: Verdict["undeclared_changes"] }) {
  return verdict.undeclared_changes.map((u) => {
    const base: Record<string, unknown> = {
      path: u.path,
      op: u.op,
      granularity: u.granularity,
      severity: u.severity,
    };
    if (u.symbol !== undefined) base["symbol"] = u.symbol;
    if (u.symbol_kind !== undefined) base["symbol_kind"] = u.symbol_kind;
    return base;
  });
}

const cases = discoverCases();

describe("corpus regression oracle — verify() conforms to expected-verdict.json", () => {
  it("discovers all fixture cases", () => {
    expect(cases.length).toBe(13);
  });

  for (const c of cases) {
    it(`${c.lang}/${c.name}`, async () => {
      const manifest = JSON.parse(
        readFileSync(join(c.caseDir, "manifest.json"), "utf8"),
      ) as Manifest;
      const expected = JSON.parse(
        readFileSync(join(c.caseDir, "expected-verdict.json"), "utf8"),
      ) as Verdict;
      const diff = parseDiff(readFileSync(join(c.caseDir, "change.diff"), "utf8"));

      const verdict = await verify({
        manifest,
        diff,
        repoRoot: c.baseDir,
        outcomes: outcomesFor(c.name),
      });

      // Top-level result + exit code + summary are asserted exactly.
      expect(verdict.result).toBe(expected.result);
      expect(verdict.exit_code).toBe(expected.exit_code);
      expect(verdict.summary).toEqual(expected.summary);
      expect(verdict.task_id).toBe(expected.task_id);

      // Per-claim: id + status exactly; a reason must be present for non-verified.
      expect(projectClaims(verdict)).toEqual(projectClaims(expected));
      for (const claim of verdict.claims) {
        if (claim.status !== "verified") {
          expect(typeof claim.reason, `${claim.id} reason`).toBe("string");
          expect((claim.reason ?? "").length).toBeGreaterThan(0);
        }
      }

      // Undeclared changes: full field set (incl. symbol/symbol_kind) and order.
      expect(projectUndeclared(verdict)).toEqual(projectUndeclared(expected));
    });
  }
});
