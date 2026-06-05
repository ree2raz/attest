import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { OutcomeCheck } from "@attest/schema";
import type { RunnerConfig } from "./types.js";

/**
 * Resolve the command for a check: explicit config wins, else auto-detect
 * (SPEC §6.4). Returns null when neither yields a command — the caller then omits
 * the check (→ `unverifiable`, never a guessed pass/fail).
 */
export function resolveCommand(
  repoDir: string,
  check: OutcomeCheck,
  config?: RunnerConfig,
): string | null {
  const explicit = configCommand(check, config);
  if (explicit) return explicit;
  return autoDetectCommand(repoDir, check);
}

function configCommand(check: OutcomeCheck, config?: RunnerConfig): string | null {
  if (!config) return null;
  switch (check) {
    case "build_passes":
      return config.build_cmd ?? null;
    case "tests_pass":
      return config.test_cmd ?? null;
    case "lint_passes":
      return config.lint_cmd ?? null;
  }
}

type Script = "build" | "test" | "lint";

function scriptFor(check: OutcomeCheck): Script {
  switch (check) {
    case "build_passes":
      return "build";
    case "tests_pass":
      return "test";
    case "lint_passes":
      return "lint";
  }
}

/**
 * Auto-detect a command from the repo's tooling. Order: Node (package.json scripts),
 * Go (go.mod), Python (pyproject/pytest), Makefile target. Returns null if none fits.
 */
export function autoDetectCommand(repoDir: string, check: OutcomeCheck): string | null {
  const script = scriptFor(check);

  const fromNode = detectNode(repoDir, script);
  if (fromNode) return fromNode;

  const fromGo = detectGo(repoDir, script);
  if (fromGo) return fromGo;

  const fromPython = detectPython(repoDir, script);
  if (fromPython) return fromPython;

  const fromMake = detectMake(repoDir, script);
  if (fromMake) return fromMake;

  return null;
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function detectPackageManager(repoDir: string): "pnpm" | "yarn" | "npm" {
  if (existsSync(join(repoDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(repoDir, "yarn.lock"))) return "yarn";
  return "npm";
}

function detectNode(repoDir: string, script: Script): string | null {
  const pkg = readJson(join(repoDir, "package.json"));
  if (!pkg) return null;
  const scripts = pkg["scripts"];
  if (typeof scripts !== "object" || scripts === null) return null;
  if (!(script in scripts)) return null;

  const pm = detectPackageManager(repoDir);
  // `test` is a built-in lifecycle script; `build`/`lint` need `run`.
  if (script === "test") {
    return pm === "yarn" ? "yarn test" : `${pm} test`;
  }
  return pm === "yarn" ? `yarn ${script}` : `${pm} run ${script}`;
}

function detectGo(repoDir: string, script: Script): string | null {
  if (!existsSync(join(repoDir, "go.mod"))) return null;
  switch (script) {
    case "test":
      return "go test ./...";
    case "build":
      return "go build ./...";
    case "lint":
      return "go vet ./...";
  }
}

function detectPython(repoDir: string, script: Script): string | null {
  const hasPython =
    existsSync(join(repoDir, "pyproject.toml")) ||
    existsSync(join(repoDir, "setup.py")) ||
    existsSync(join(repoDir, "pytest.ini")) ||
    existsSync(join(repoDir, "tox.ini"));
  if (!hasPython) return null;
  // Only the test command is reliably inferable for Python; build/lint vary too much.
  return script === "test" ? "pytest" : null;
}

function detectMake(repoDir: string, script: Script): string | null {
  const makefile = join(repoDir, "Makefile");
  if (!existsSync(makefile)) return null;
  let contents: string;
  try {
    contents = readFileSync(makefile, "utf8");
  } catch {
    return null;
  }
  // A target is a line beginning `<name>:`.
  const targetRe = new RegExp(`^${script}:`, "m");
  return targetRe.test(contents) ? `make ${script}` : null;
}
