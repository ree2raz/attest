import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const REPO_ROOT = resolve(__dirname, "../../..");
const ACTION_YML = join(REPO_ROOT, "action.yml");
const WORKFLOW_YML = join(REPO_ROOT, ".github/workflows/attest-fixture.yml");

describe("action.yml", () => {
  it("exists and is well-formed YAML", () => {
    expect(existsSync(ACTION_YML)).toBe(true);
    const raw = readFileSync(ACTION_YML, "utf-8");
    const doc = parseYaml(raw) as Record<string, unknown>;
    expect(doc["name"]).toBe("attest");
    expect(typeof doc["description"]).toBe("string");
    expect((doc["description"] as string).length).toBeGreaterThan(20);
  });

  it("declares a composite run with Node setup and the expected inputs", () => {
    const doc = parseYaml(readFileSync(ACTION_YML, "utf-8")) as Record<string, unknown>;
    expect(doc["runs"]).toBeDefined();
    const runs = doc["runs"] as Record<string, unknown>;
    expect(runs["using"]).toBe("composite");
    expect(Array.isArray(runs["steps"])).toBe(true);

    const inputs = doc["inputs"] as Record<string, Record<string, unknown>>;
    expect(inputs["manifest"]["required"]).toBe(true);
    expect(inputs["diff"]).toBeDefined();
    expect(inputs["repo-root"]).toBeDefined();
    expect(inputs["format"]).toBeDefined();
    expect(inputs["format"]["default"]).toBe("human");
    expect(inputs["version"]).toBeDefined();
  });

  it("exposes marketplace branding and outputs", () => {
    const doc = parseYaml(readFileSync(ACTION_YML, "utf-8")) as Record<string, unknown>;
    const branding = doc["branding"] as Record<string, string>;
    expect(branding["icon"]).toBeTruthy();
    expect(branding["color"]).toBeTruthy();
    const outputs = doc["outputs"] as Record<string, string>;
    expect(outputs["result"]).toBeDefined();
    expect(outputs["exit-code"]).toBeDefined();
    expect(outputs["verdict"]).toBeDefined();
  });

  it("invokes the npx call the WU11 tarball provides", () => {
    const doc = parseYaml(readFileSync(ACTION_YML, "utf-8")) as Record<string, unknown>;
    const runs = doc["runs"] as Record<string, unknown>;
    const steps = runs["steps"] as Array<Record<string, unknown>>;
    const runStep = steps.find(
      (s) => typeof s["run"] === "string" && /npx/.test(s["run"] as string),
    );
    expect(runStep).toBeDefined();
    const run = runStep!["run"] as string;
    expect(run).toMatch(/npx.*@attest\/cli/);
    expect(run).toMatch(/--manifest/);
    expect(run).toMatch(/--repo-root/);
    expect(run).toMatch(/--format/);
  });
});

describe("example workflow", () => {
  it("exists, parses, and references ./ as the action source", () => {
    expect(existsSync(WORKFLOW_YML)).toBe(true);
    const doc = parseYaml(readFileSync(WORKFLOW_YML, "utf-8")) as Record<string, unknown>;
    const jobs = doc["jobs"] as Record<string, Record<string, unknown>>;
    expect(jobs["verify-honest"]).toBeDefined();
    expect(jobs["verify-lying"]).toBeDefined();

    const honestSteps = (jobs["verify-honest"]["steps"] as Array<Record<string, unknown>>).filter(
      (s) => s["uses"] !== undefined,
    );
    expect(honestSteps.some((s) => s["uses"] === "./")).toBe(true);

    const lyingSteps = (jobs["verify-lying"]["steps"] as Array<Record<string, unknown>>).filter(
      (s) => s["uses"] !== undefined,
    );
    expect(lyingSteps.some((s) => s["uses"] === "./")).toBe(true);
  });
});

/**
 * End-to-end acceptance: the action's underlying `npx @attest/cli@<version>` call
 * — which is the only thing the composite step actually does — behaves
 * correctly on the fixture corpus. Locally we run the *built* CLI from
 * `packages/cli/dist/index.js` (the same artifact the WU11 tarball contains);
 * on GitHub Actions the npx call resolves to the published package. The
 * code path is identical. Honest case ⇒ exit 0 / `result: pass`; lying case
 * ⇒ exit 1 / `result: fail`.
 */
describe("action npx invocation (matches the composite step)", () => {
  const CLI_DIST = join(REPO_ROOT, "packages/cli/dist/index.js");
  const skipIfNoBundle = existsSync(CLI_DIST) ? it : it.skip;

  function git(args: string[], cwd: string): string {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  }

  function setupFixture(): string {
    const dir = mkdtempSync(join(tmpdir(), "attest-action-"));
    const base = join(REPO_ROOT, "corpus/ts/base");
    // `cp -a base/. dir` copies contents (preserves hidden files, exec bits, mtimes).
    execFileSync("cp", ["-a", `${base}/.`, dir], { stdio: "ignore" });
    git(["init", "-q"], dir);
    git(["config", "user.email", "x@x"], dir);
    git(["config", "user.name", "x"], dir);
    git(["add", "-A"], dir);
    git(["commit", "-qm", "base"], dir);
    // NB: do NOT pre-apply the diff to the worktree. `attest verify` applies
    // the diff itself when reconstructing post-state. The action's --diff input
    // is the source of truth, not the worktree contents.
    return dir;
  }

  skipIfNoBundle(
    "returns exit 0 on the honest fixture",
    () => {
      const dir = setupFixture();
      const status = execFileSync(
        "node",
        [
          CLI_DIST,
          "verify",
          "--manifest",
          join(REPO_ROOT, "corpus/ts/cases/honest/manifest.json"),
          "--diff",
          join(REPO_ROOT, "corpus/ts/cases/honest/change.diff"),
          "--repo-root",
          dir,
          "--format",
          "json",
        ],
        { stdio: "pipe" },
      ).toString("utf-8");
      expect(status).toMatch(/"result":\s*"pass"/);
    },
    120_000,
  );

  skipIfNoBundle(
    "returns exit 1 on the lying fixture",
    () => {
      const dir = setupFixture();
      let exit = 0;
      try {
        execFileSync(
          "node",
          [
            CLI_DIST,
            "verify",
            "--manifest",
            join(REPO_ROOT, "corpus/ts/cases/lying/manifest.json"),
            "--diff",
            join(REPO_ROOT, "corpus/ts/cases/lying/change.diff"),
            "--repo-root",
            dir,
            "--format",
            "json",
          ],
          { stdio: "pipe" },
        );
      } catch (e) {
        exit = (e as { status?: number }).status ?? 1;
      }
      expect(exit).toBe(1);
    },
    120_000,
  );
});
