import type { AttestConfig } from "./types.js";

/**
 * Default allowlist + test classification (SPEC §6.3). Deterministic, structural,
 * no globbing engine — explicit predicates over path basenames and segments.
 *
 * NOTE: "formatting-only hunks" (mentioned in §6.3) are not yet suppressed; that
 * requires whitespace-only hunk detection and is a bounded follow-on (no corpus
 * case exercises it). Lockfiles and generated directories are covered now.
 */

const DEFAULT_ALLOWLIST_BASENAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "go.sum",
  "poetry.lock",
  "Pipfile.lock",
  "Cargo.lock",
  "composer.lock",
  "Gemfile.lock",
]);

const DEFAULT_ALLOWLIST_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "vendor",
  ".next",
  "__generated__",
]);

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function segments(path: string): string[] {
  return path.split("/");
}

/** True iff an undeclared change to `path` should be suppressed (severity `suppressed`). */
export function isAllowlisted(path: string, config?: AttestConfig): boolean {
  const base = basename(path);
  if (DEFAULT_ALLOWLIST_BASENAMES.has(base)) return true;
  if (config?.allowlistBasenames?.includes(base)) return true;

  const segs = segments(path);
  for (const seg of segs) {
    if (DEFAULT_ALLOWLIST_DIRS.has(seg)) return true;
    if (config?.allowlistDirs?.includes(seg)) return true;
  }
  return false;
}

const TEST_FILE_PATTERNS: RegExp[] = [
  /\.(test|spec)\.[cm]?[jt]sx?$/, // foo.test.ts, foo.spec.jsx, ...
  /(^|\/)test_[^/]+\.py$/, // test_calc.py
  /_test\.go$/, // calc_test.go
];

const TEST_DIR_SEGMENTS = new Set(["tests", "test", "__tests__"]);

/** True iff `path` is classified as a test file (SPEC §6.2 test verification). */
export function isTestFile(path: string, config?: AttestConfig): boolean {
  if (TEST_FILE_PATTERNS.some((re) => re.test(path))) return true;
  if (segments(path).some((seg) => TEST_DIR_SEGMENTS.has(seg))) return true;
  if (config?.testGlobsExtra?.some((prefix) => path.startsWith(prefix))) return true;
  return false;
}
