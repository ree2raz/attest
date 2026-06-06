import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * An isolated git worktree materializing the post-change state. SPEC §6.4 makes
 * isolation a correctness requirement: outcome commands must NOT run in the live
 * working tree. (Untrusted agent code still needs container isolation — Phase 3.)
 */
export interface Worktree {
  /** Absolute path to the worktree root. */
  dir: string;
  /** Remove the worktree and its temp parent. Idempotent; never throws. */
  cleanup(): void;
}

/**
 * Create a detached worktree at `baseRef`, optionally applying `diffText` to reach
 * the post-change state. Throws if `repoRoot` is not a git work tree or the diff
 * does not apply — a failure here must surface, not be silently swallowed.
 */
export function createWorktree(repoRoot: string, baseRef: string, diffText?: string): Worktree {
  const parent = mkdtempSync(join(tmpdir(), "attest-wt-"));
  const dir = join(parent, "wt");

  git(repoRoot, ["worktree", "add", "--detach", dir, baseRef]);

  if (diffText && diffText.trim()) {
    const patch = join(parent, "change.diff");
    writeFileSync(patch, diffText.endsWith("\n") ? diffText : `${diffText}\n`);
    try {
      git(dir, ["apply", "--whitespace=nowarn", patch]);
    } catch (err) {
      // Clean up the partial worktree before propagating.
      remove(repoRoot, dir, parent);
      throw err;
    }
  }

  return {
    dir,
    cleanup() {
      remove(repoRoot, dir, parent);
    },
  };
}

function remove(repoRoot: string, dir: string, parent: string): void {
  try {
    git(repoRoot, ["worktree", "remove", "--force", dir]);
  } catch {
    // best-effort
  }
  try {
    rmSync(parent, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
