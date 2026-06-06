import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runOutcomes } from "../src/index.js";

const repos: string[] = [];

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "attest-repo-"));
  repos.push(dir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "t@t.dev");
  git("config", "user.name", "t");
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  return dir;
}

function worktreeCount(dir: string): number {
  const out = execFileSync("git", ["worktree", "list"], { cwd: dir, encoding: "utf8" });
  return out.trim().split("\n").length;
}

afterEach(() => {
  while (repos.length) rmSync(repos.pop()!, { recursive: true, force: true });
});

describe("runOutcomes", () => {
  it("captures pass/fail by exit code", async () => {
    const repo = makeRepo();
    const out = await runOutcomes({
      repoRoot: repo,
      checks: ["tests_pass", "build_passes"],
      config: { test_cmd: "exit 0", build_cmd: "exit 3" },
    });

    expect(out.tests_pass).toMatchObject({ passed: true, exitCode: 0, cmd: "exit 0" });
    expect(out.build_passes).toMatchObject({ passed: false, exitCode: 3 });
    expect(typeof out.tests_pass?.durationMs).toBe("number");
  });

  it("runs in an isolated worktree, not the live tree", async () => {
    const repo = makeRepo();
    await runOutcomes({
      repoRoot: repo,
      checks: ["tests_pass"],
      config: { test_cmd: "touch SENTINEL" },
    });
    // The command's side effect must not leak into the real repo.
    expect(existsSync(join(repo, "SENTINEL"))).toBe(false);
  });

  it("applies the diff to reach the post-change state", async () => {
    const repo = makeRepo();
    const diffText = [
      "diff --git a/added.txt b/added.txt",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/added.txt",
      "@@ -0,0 +1 @@",
      "+hello",
      "",
    ].join("\n");

    const withDiff = await runOutcomes({
      repoRoot: repo,
      checks: ["tests_pass"],
      diffText,
      config: { test_cmd: "test -f added.txt" },
    });
    expect(withDiff.tests_pass?.passed).toBe(true);

    const withoutDiff = await runOutcomes({
      repoRoot: repo,
      checks: ["tests_pass"],
      config: { test_cmd: "test -f added.txt" },
    });
    expect(withoutDiff.tests_pass?.passed).toBe(false);
  });

  it("truncates long logs", async () => {
    const repo = makeRepo();
    const out = await runOutcomes({
      repoRoot: repo,
      checks: ["tests_pass"],
      config: { test_cmd: "for i in $(seq 1 500); do echo line$i; done" },
      logLimitBytes: 200,
    });
    expect(out.tests_pass?.log).toContain("truncated");
    expect((out.tests_pass?.log ?? "").length).toBeLessThan(400);
  });

  it("omits checks with no resolvable command (→ unverifiable upstream)", async () => {
    const repo = makeRepo(); // no tooling files
    const out = await runOutcomes({ repoRoot: repo, checks: ["lint_passes"] });
    expect(out.lint_passes).toBeUndefined();
  });

  it("leaves no worktree behind", async () => {
    const repo = makeRepo();
    const before = worktreeCount(repo);
    await runOutcomes({ repoRoot: repo, checks: ["tests_pass"], config: { test_cmd: "exit 0" } });
    expect(worktreeCount(repo)).toBe(before);
  });
});
