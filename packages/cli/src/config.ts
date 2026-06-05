import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AttestConfig } from "@attest/core";
import type { RunnerConfig } from "@attest/runner";

/** Raw shape accepted in attest.config.json (snake_case for TOML compat). */
interface RawConfig {
  build_cmd?: string;
  test_cmd?: string;
  lint_cmd?: string;
  allowlist_basenames?: string[];
  allowlist_dirs?: string[];
  test_globs_extra?: string[];
}

export interface LoadedConfig {
  attestConfig: AttestConfig | undefined;
  runnerConfig: RunnerConfig | undefined;
}

/**
 * Load attest.config.json from repoRoot (attest.toml support deferred to Phase 2).
 * Returns undefined configs when no file exists — callers pass undefined to core/runner
 * so their defaults apply.
 */
export async function loadConfig(repoRoot: string): Promise<LoadedConfig> {
  let raw: RawConfig | undefined;

  for (const name of ["attest.config.json"]) {
    try {
      const text = await readFile(join(repoRoot, name), "utf-8");
      raw = JSON.parse(text) as RawConfig;
      break;
    } catch {
      // not found or not valid JSON — continue
    }
  }

  if (!raw) return { attestConfig: undefined, runnerConfig: undefined };

  const runnerConfig: RunnerConfig = {};
  if (raw.build_cmd) runnerConfig.build_cmd = raw.build_cmd;
  if (raw.test_cmd) runnerConfig.test_cmd = raw.test_cmd;
  if (raw.lint_cmd) runnerConfig.lint_cmd = raw.lint_cmd;

  const attestConfig: AttestConfig = {};
  if (raw.allowlist_basenames) attestConfig.allowlistBasenames = raw.allowlist_basenames;
  if (raw.allowlist_dirs) attestConfig.allowlistDirs = raw.allowlist_dirs;
  if (raw.test_globs_extra) attestConfig.testGlobsExtra = raw.test_globs_extra;

  return { attestConfig, runnerConfig };
}
