import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const CORPUS = join(REPO_ROOT, "corpus");
const CLI_DIST = join(__dirname, "..", "dist", "index.js");

interface ExpectedClaim {
  id: string;
  status: string;
  reason?: string;
}
interface ExpectedUndeclared {
  path: string;
  op: string;
  granularity: string;
  severity: string;
  symbol?: string;
  symbol_kind?: string;
}
interface ExpectedVerdict {
  result: string;
  exit_code: number;
  claims: ExpectedClaim[];
  undeclared_changes: ExpectedUndeclared[];
  summary: {
    claims_total: number;
    verified: number;
    failed: number;
    unverifiable: number;
    undeclared: number;
  };
}

interface VerdictShape {
  result: string;
  exit_code: number;
  summary: ExpectedVerdict["summary"];
  claims: Array<{ id: string; status: string; reason?: string }>;
  undeclared_changes: ExpectedUndeclared[];
}

function toolOnPath(cmd: string): boolean {
  const r = spawnSync("sh", ["-c", `command -v ${cmd} >/dev/null 2>&1`], { encoding: "utf8" });
  return r.status === 0;
}

async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_DIST, ...args], {
      cwd: REPO_ROOT,
    });
    return { code: 0, stdout, stderr };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: e.code ?? 1 };
  }
}

function materializeBase(lang: string): string {
  const baseTemp = mkdtempSync(join(tmpdir(), `attest-corpus-${lang}-`));
  // path.join collapses a trailing "." — append the separator so cp copies CONTENTS, not the dir itself.
  const src = `${join(CORPUS, lang, "base")}/.`;
  const cp = spawnSync("cp", ["-a", src, baseTemp], { cwd: REPO_ROOT, stdio: "ignore" });
  if (cp.status !== 0) throw new Error(`cp base into ${baseTemp} failed: ${cp.stderr?.toString()}`);
  const g1 = spawnSync("git", ["-C", baseTemp, "init", "-q"], { cwd: REPO_ROOT, stdio: "ignore" });
  if (g1.status !== 0) throw new Error(`git init in ${baseTemp} failed: ${g1.stderr?.toString()}`);
  const g2 = spawnSync(
    "git",
    ["-C", baseTemp, "-c", "user.email=corpus@attest.dev", "-c", "user.name=corpus", "add", "-A"],
    { cwd: REPO_ROOT, stdio: "ignore" },
  );
  if (g2.status !== 0) throw new Error(`git add in ${baseTemp} failed: ${g2.stderr?.toString()}`);
  const g3 = spawnSync(
    "git",
    [
      "-C",
      baseTemp,
      "-c",
      "user.email=corpus@attest.dev",
      "-c",
      "user.name=corpus",
      "commit",
      "-qm",
      "base",
    ],
    { cwd: REPO_ROOT, stdio: "ignore" },
  );
  if (g3.status !== 0)
    throw new Error(`git commit in ${baseTemp} failed: ${g3.stderr?.toString()}`);
  return baseTemp;
}

const LANGS = ["ts", "py", "go"] as const;
type Lang = (typeof LANGS)[number];

const SKIPPED: Lang[] = [];
for (const lang of LANGS) {
  const tool = lang === "ts" ? "node" : lang === "py" ? "python3" : "go";
  if (!toolOnPath(tool)) SKIPPED.push(lang);
}

const TEMPS: string[] = [];
afterAll(() => {
  for (const t of TEMPS) {
    try {
      rmSync(t, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

if (SKIPPED.length > 0) {
  console.warn(`[corpus] skipping languages (toolchain missing on PATH): ${SKIPPED.join(", ")}`);
}

describe("attest corpus acceptance (SPEC §6.7)", () => {
  for (const lang of LANGS) {
    if (SKIPPED.includes(lang)) continue;
    if (!existsSync(join(CORPUS, lang, "cases"))) continue;
    const cases = readdirSync(join(CORPUS, lang, "cases"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    describe(`${lang}`, () => {
      let baseTemp: string;

      beforeAll(() => {
        baseTemp = materializeBase(lang);
        TEMPS.push(baseTemp);
      }, 60_000);

      for (const caseName of cases) {
        const caseDir = join(CORPUS, lang, "cases", caseName);

        describe(`${caseName}`, () => {
          let expected: ExpectedVerdict;
          let actual: { verdict: VerdictShape; code: number };

          beforeAll(async () => {
            expected = JSON.parse(
              readFileSync(join(caseDir, "expected-verdict.json"), "utf-8"),
            ) as ExpectedVerdict;
            const result = await runCli([
              "verify",
              "--manifest",
              join(caseDir, "manifest.json"),
              "--diff",
              join(caseDir, "change.diff"),
              "--repo-root",
              baseTemp,
              "--format",
              "json",
              "--no-color",
            ]);
            let verdict: VerdictShape;
            try {
              verdict = JSON.parse(result.stdout) as VerdictShape;
            } catch {
              verdict = {
                result: "unknown",
                exit_code: result.code,
                summary: {
                  claims_total: 0,
                  verified: 0,
                  failed: 0,
                  unverifiable: 0,
                  undeclared: 0,
                },
                claims: [],
                undeclared_changes: [],
              };
            }
            actual = { verdict, code: result.code };
          }, 600_000);

          it("result + exit_code + summary match expected", () => {
            expect(actual.verdict.result).toBe(expected.result);
            expect(actual.verdict.exit_code).toBe(expected.exit_code);
            expect(actual.verdict.summary).toEqual(expected.summary);
            expect(actual.code).toBe(actual.verdict.exit_code);
          });

          it("per-claim id + status (+ reason for failed/unverifiable) match expected", () => {
            const expClaims = new Map(expected.claims.map((c) => [c.id, c]));
            expect(actual.verdict.claims.length).toBe(expected.claims.length);
            for (const claim of actual.verdict.claims) {
              const exp = expClaims.get(claim.id);
              expect(exp, `claim ${claim.id} present in expected`).toBeDefined();
              expect(claim.status, `claim ${claim.id} status`).toBe(exp!.status);
              if (claim.status === "failed" || claim.status === "unverifiable") {
                expect(typeof claim.reason, `claim ${claim.id} reason`).toBe("string");
                expect(claim.reason!.length, `claim ${claim.id} reason non-empty`).toBeGreaterThan(
                  0,
                );
              }
            }
          });

          it("per-undeclared (path/op/granularity/severity/symbol/symbol_kind) match expected", () => {
            expect(actual.verdict.undeclared_changes.length).toBe(
              expected.undeclared_changes.length,
            );
            for (let i = 0; i < actual.verdict.undeclared_changes.length; i++) {
              const act = actual.verdict.undeclared_changes[i]!;
              const exp = expected.undeclared_changes[i]!;
              expect(act.path, `undeclared[${i}].path`).toBe(exp.path);
              expect(act.op, `undeclared[${i}].op`).toBe(exp.op);
              expect(act.granularity, `undeclared[${i}].granularity`).toBe(exp.granularity);
              expect(act.severity, `undeclared[${i}].severity`).toBe(exp.severity);
              if (exp.symbol !== undefined)
                expect(act.symbol, `undeclared[${i}].symbol`).toBe(exp.symbol);
              if (exp.symbol_kind !== undefined)
                expect(act.symbol_kind, `undeclared[${i}].symbol_kind`).toBe(exp.symbol_kind);
            }
          });
        });
      }
    });
  }
});
