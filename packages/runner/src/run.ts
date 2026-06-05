import { resolveCommand } from "./detect.js";
import { runCommand } from "./exec.js";
import { createWorktree } from "./worktree.js";
import type { RunOutcomes, RunnerOptions } from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_LOG_LIMIT_BYTES = 4_000;

/**
 * Execute the requested outcome checks under worktree isolation and return their
 * results (SPEC §6.4). Checks with no resolvable command are omitted — core then
 * reports them `unverifiable`, never a guessed pass/fail.
 *
 * The returned map is assignable to core's `OutcomeResults`, so the CLI can pass
 * it straight into `verify`.
 */
export async function runOutcomes(options: RunnerOptions): Promise<RunOutcomes> {
  const {
    repoRoot,
    checks,
    baseRef = "HEAD",
    diffText,
    config,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    logLimitBytes = DEFAULT_LOG_LIMIT_BYTES,
  } = options;

  const resolved: Array<readonly [(typeof checks)[number], string]> = [];
  for (const check of checks) {
    const cmd = resolveCommand(repoRoot, check, config);
    if (cmd) resolved.push([check, cmd] as const);
  }

  const out: RunOutcomes = {};
  if (resolved.length === 0) return out;

  const worktree = createWorktree(repoRoot, baseRef, diffText);
  try {
    for (const [check, cmd] of resolved) {
      const result = runCommand(cmd, worktree.dir, timeoutMs, logLimitBytes);
      out[check] = {
        check,
        passed: result.exitCode === 0,
        cmd: result.cmd,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        log: result.log,
      };
    }
  } finally {
    worktree.cleanup();
  }

  return out;
}
