import type { Manifest, OutcomeCheck } from "@attest/schema";
import type { ParsedDiff } from "@attest/diff";

/**
 * Result of executing one declared `outcome` check. Produced by `@attest/runner`
 * and injected into `verify` — core never shells out, keeping the verification
 * path pure and deterministic (the runner owns isolation + execution).
 */
export interface OutcomeResult {
  passed: boolean;
  cmd?: string;
  exitCode?: number;
  durationMs?: number;
}

/** Injected outcome results, keyed by the check they satisfy. */
export type OutcomeResults = Partial<Record<OutcomeCheck, OutcomeResult>>;

/**
 * Configuration affecting verification (SPEC §6.3 allowlist, test classification).
 * All fields optional; sensible defaults are applied in config.ts.
 */
export interface AttestConfig {
  /** Extra basenames treated as allowlisted (suppressed) undeclared changes. */
  allowlistBasenames?: string[];
  /** Extra path segments (directory names) treated as generated/allowlisted. */
  allowlistDirs?: string[];
  /** Extra path prefixes classified as test locations. */
  testGlobsExtra?: string[];
}

/** Inputs to `verify` (SPEC §6.1). */
export interface VerifyInput {
  manifest: Manifest;
  /** Parsed diff (base → post). The diff applies to `repoRoot`'s pre-change state. */
  diff: ParsedDiff;
  /** Pre-change repository root; base file contents are read from here. */
  repoRoot: string;
  config?: AttestConfig;
  /** Outcome-check results from the runner; absent checks → `unverifiable`. */
  outcomes?: OutcomeResults;
}
