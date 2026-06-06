import type { ParsedDiff } from "@attest/diff";

/**
 * Public types for `@attest/detectors-ts`. This package is the demoted,
 * opt-in, best-effort plugin layer from SPEC §6.5. **It is never part of the
 * core verdict**: `verdict.exit_code` is computed in `@attest/core/verify.ts`
 * and the detectors-ts API has no path back into it. Do not gate CI on these
 * outputs.
 */

/** Standard advisory warnings carried on every {@link DetectorOutput}. */
export const DETECTOR_WARNINGS: readonly string[] = [
  "best-effort",
  "non-deterministic across frameworks",
  "not part of the core verdict — do not use in CI gates",
] as const;

/**
 * Advisory status. Three values only — never `verified` / `failed` /
 * `unverifiable`, which belong to the closed verdict taxonomy (SPEC §4.2).
 *
 * - `advisory_present`:    heuristic found an auth signal in this (file, route).
 * - `advisory_absent`:     heuristic found no auth signal.
 * - `advisory_inconclusive`: heuristic could not decide (unknown middleware,
 *   unsupported framework, parse error, etc.).
 */
export type DetectorStatus = "advisory_present" | "advisory_absent" | "advisory_inconclusive";

/** Input to {@link runDetectors}. */
export interface DetectorInput {
  /** Parsed unified diff (base → post). */
  diff: ParsedDiff;
  /** Pre-change repository root; post-change file contents are read from here. */
  repoRoot: string;
  /**
   * Optional content override; defaults to `readFile(join(repoRoot, path))`.
   * Useful for tests and for callers that have already materialised the
   * post-change tree (e.g. inside a worktree).
   */
  readFile?: (path: string) => Promise<string | null>;
}

/** Lower-level input to {@link detectAuthentication}. */
export interface AuthenticationInput {
  path: string;
  symbol: string;
  content: string;
}

/**
 * One advisory annotation. A consumer of `@attest/detectors-ts` receives an
 * array of these from {@link runDetectors}. The {@link warnings} field is
 * always populated with {@link DETECTOR_WARNINGS} so the advisory nature is
 * visible on every record.
 */
export interface DetectorOutput {
  /** Detector name. `"authentication"` is the only one shipped. */
  detector: "authentication";
  /** Repo-relative path of the scanned file. */
  path: string;
  /**
   * Route symbol: `"POST /x"`-style for Express/Fastify/Koa/raw-Node,
   * `"ClassName.methodName"` for NestJS, or whatever the caller passed.
   */
  symbol: string;
  /** Detected framework, or `"unknown"` if none of the recognisable imports is present. */
  framework: string;
  status: DetectorStatus;
  /** Optional machine-readable reason — preserved from the v0.1 detector for compatibility. */
  reason_code?: string;
  /** Human-readable summary. */
  note: string;
  /** Per-evidence items; `kind: "route"` is the summary entry, `kind: "middleware"` is a chain entry. */
  evidence: Array<{ kind: "route" | "middleware"; symbol?: string; note?: string }>;
  /** Always equal to {@link DETECTOR_WARNINGS}; surfaced on every output. */
  warnings: readonly string[];
}
