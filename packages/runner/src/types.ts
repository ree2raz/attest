import type { OutcomeCheck } from "@attest/schema";
import type { OutcomeResult } from "@attest/core";

/**
 * Runner configuration (SPEC §6.4). Explicit commands override auto-detection.
 * Loaded from `attest.toml` / `attest.config.json` by the CLI (WU7) and passed in;
 * the runner itself does not read config files.
 */
export interface RunnerConfig {
  build_cmd?: string;
  test_cmd?: string;
  lint_cmd?: string;
}

/** An executed outcome, extending the core {@link OutcomeResult} with the captured log. */
export interface RunOutcome extends OutcomeResult {
  check: OutcomeCheck;
  /** Combined stdout+stderr, head/tail-truncated. */
  log?: string;
}

/**
 * Map of executed outcomes. Assignable to core's `OutcomeResults`, so the CLI can
 * pass it straight into `verify`. Checks with no resolvable command are omitted
 * (core then reports them `unverifiable`, never `failed`).
 */
export type RunOutcomes = Partial<Record<OutcomeCheck, RunOutcome>>;

export interface RunnerOptions {
  /** Pre-change repository root (must be a git work tree). */
  repoRoot: string;
  /** Which outcome checks to execute. */
  checks: OutcomeCheck[];
  /** Base ref the worktree is created from. Defaults to `HEAD`. */
  baseRef?: string;
  /**
   * Unified diff to apply in the worktree to reach the post-change state. Omit when
   * `baseRef` already points at the post-change commit.
   */
  diffText?: string;
  config?: RunnerConfig;
  /** Per-command wall-clock timeout (ms). Default 120000. */
  timeoutMs?: number;
  /** Max bytes of log retained per command (head+tail). Default 4000. */
  logLimitBytes?: number;
}

/** Low-level result of executing a single command. */
export interface CommandResult {
  cmd: string;
  exitCode: number;
  log: string;
  durationMs: number;
}
