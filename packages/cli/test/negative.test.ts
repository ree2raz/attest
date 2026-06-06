/**
 * WU14 — Legible schema errors. Negative cases: deliberately-broken manifests
 * should fail with a path-pointed one-line error and the documented exit code
 * (2 = manifest malformed; distinct from 1 = verification fail).
 *
 * These run the CLI as a child process and assert on stderr + exit code, which
 * is what CI users see in the GitHub Action log.
 */
import { describe, it, expect } from "vitest";
import { execFile, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const CORPUS = join(REPO_ROOT, "corpus");
const CLI_DIST = join(__dirname, "..", "dist", "index.js");

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

const HAS_NODE = toolOnPath("node");

const TEMPS: string[] = [];
function writeManifest(name: string, body: object): string {
  const dir = mkdtempSync(join(tmpdir(), `attest-neg-${name}-`));
  TEMPS.push(dir);
  const p = join(dir, "manifest.json");
  writeFileSync(p, JSON.stringify(body, null, 2));
  return p;
}

function corpusHonestTs(): { manifest: string; diff: string; baseTmp: string } {
  // Reuse the TS honest fixture's actual base + manifest + diff. The manifest
  // we feed in is the one under test (broken); the diff + base are real so the
  // CLI would actually be able to run the verifier if the manifest passed.
  const caseDir = join(CORPUS, "ts", "cases", "honest");
  const base = join(CORPUS, "ts", "base");
  const baseTmp = mkdtempSync(join(tmpdir(), "attest-neg-base-"));
  TEMPS.push(baseTmp);
  const src = `${join(base)}/.`;
  const cp = spawnSync("cp", ["-a", src, baseTmp], { stdio: "ignore" });
  if (cp.status !== 0) throw new Error("cp base failed");
  spawnSync("git", ["-C", baseTmp, "init", "-q"], { stdio: "ignore" });
  spawnSync("git", ["-C", baseTmp, "add", "-A"], { stdio: "ignore" });
  spawnSync(
    "git",
    ["-C", baseTmp, "-c", "user.email=x", "-c", "user.name=x", "commit", "-qm", "b"],
    {
      stdio: "ignore",
    },
  );
  return {
    manifest: join(caseDir, "manifest.json"),
    diff: join(caseDir, "change.diff"),
    baseTmp,
  };
}

describe.skipIf(!HAS_NODE)("manifest validation — negative exit code (WU14)", () => {
  it("wrong attest_version → exit 2 + path-pointed message", async () => {
    const good = corpusHonestTs();
    const manifest = writeManifest("version", {
      attest_version: "0.1",
      task: { id: "T-1", description: "x" },
      agent: { id: "claude-code" },
      generated_at: "2026-06-06T00:00:00Z",
      declared_scope: { files: ["src/auth.ts"] },
      claims: [{ id: "c1", kind: "file_change", op: "modify", path: "src/auth.ts" }],
    });
    const r = await runCli([
      "verify",
      "--manifest",
      manifest,
      "--diff",
      good.diff,
      "--repo-root",
      good.baseTmp,
    ]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/manifest is structurally invalid/);
    expect(r.stderr).toMatch(/attest_version: must be exactly "1\.0"/);
    // Should NOT dump raw ajv JSON.
    expect(r.stderr).not.toMatch(/\{[^{}]*"keyword"[^{}]*\}/);
  });

  it("missing required field on a claim → exit 2 + path-pointed message", async () => {
    const good = corpusHonestTs();
    const manifest = writeManifest("missing", {
      attest_version: "1.0",
      task: { id: "T-1", description: "x" },
      agent: { id: "claude-code" },
      generated_at: "2026-06-06T00:00:00Z",
      declared_scope: { files: ["src/auth.ts"] },
      claims: [{ id: "c1", kind: "file_change", path: "src/auth.ts" } as never],
    });
    const r = await runCli([
      "verify",
      "--manifest",
      manifest,
      "--diff",
      good.diff,
      "--repo-root",
      good.baseTmp,
    ]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/claims\/0: missing required field "op"/);
  });

  it("wrong outcome.check enum → exit 2 + allowed values listed", async () => {
    const good = corpusHonestTs();
    const manifest = writeManifest("enum", {
      attest_version: "1.0",
      task: { id: "T-1", description: "x" },
      agent: { id: "claude-code" },
      generated_at: "2026-06-06T00:00:00Z",
      declared_scope: { files: ["src/auth.ts"] },
      claims: [{ id: "c1", kind: "outcome", check: "deploy_succeeds" } as never],
    });
    const r = await runCli([
      "verify",
      "--manifest",
      manifest,
      "--diff",
      good.diff,
      "--repo-root",
      good.baseTmp,
    ]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/claims\/0\/check: must be one of/);
    expect(r.stderr).toMatch(/build_passes/);
    expect(r.stderr).toMatch(/tests_pass/);
    expect(r.stderr).toMatch(/lint_passes/);
  });
});
