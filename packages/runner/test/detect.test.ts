import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { autoDetectCommand, resolveCommand } from "../src/index.js";

const dirs: string[] = [];
function scratch(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "attest-detect-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("autoDetectCommand — Node", () => {
  const pkg = JSON.stringify({ scripts: { test: "vitest", build: "tsc", lint: "eslint ." } });

  it("uses npm by default", () => {
    const dir = scratch({ "package.json": pkg });
    expect(autoDetectCommand(dir, "tests_pass")).toBe("npm test");
    expect(autoDetectCommand(dir, "build_passes")).toBe("npm run build");
    expect(autoDetectCommand(dir, "lint_passes")).toBe("npm run lint");
  });

  it("uses pnpm when a pnpm lockfile is present", () => {
    const dir = scratch({ "package.json": pkg, "pnpm-lock.yaml": "" });
    expect(autoDetectCommand(dir, "tests_pass")).toBe("pnpm test");
    expect(autoDetectCommand(dir, "build_passes")).toBe("pnpm run build");
  });

  it("uses yarn when a yarn lockfile is present", () => {
    const dir = scratch({ "package.json": pkg, "yarn.lock": "" });
    expect(autoDetectCommand(dir, "tests_pass")).toBe("yarn test");
    expect(autoDetectCommand(dir, "build_passes")).toBe("yarn build");
  });

  it("returns null for a script that does not exist", () => {
    const dir = scratch({ "package.json": JSON.stringify({ scripts: { test: "vitest" } }) });
    expect(autoDetectCommand(dir, "build_passes")).toBeNull();
  });
});

describe("autoDetectCommand — Go / Python / Make", () => {
  it("detects Go commands from go.mod", () => {
    const dir = scratch({ "go.mod": "module x\n" });
    expect(autoDetectCommand(dir, "tests_pass")).toBe("go test ./...");
    expect(autoDetectCommand(dir, "build_passes")).toBe("go build ./...");
    expect(autoDetectCommand(dir, "lint_passes")).toBe("go vet ./...");
  });

  it("detects pytest from pyproject and declines build/lint", () => {
    const dir = scratch({ "pyproject.toml": "[project]\nname='x'\n" });
    expect(autoDetectCommand(dir, "tests_pass")).toBe("pytest");
    expect(autoDetectCommand(dir, "build_passes")).toBeNull();
  });

  it("detects a Makefile target", () => {
    const dir = scratch({ Makefile: "test:\n\techo hi\n" });
    expect(autoDetectCommand(dir, "tests_pass")).toBe("make test");
    expect(autoDetectCommand(dir, "build_passes")).toBeNull();
  });

  it("returns null with no recognizable tooling", () => {
    const dir = scratch({ "README.md": "# hi" });
    expect(autoDetectCommand(dir, "tests_pass")).toBeNull();
  });
});

describe("resolveCommand", () => {
  it("prefers explicit config over auto-detection", () => {
    const dir = scratch({ "go.mod": "module x\n" });
    expect(resolveCommand(dir, "tests_pass", { test_cmd: "make check" })).toBe("make check");
  });

  it("falls back to auto-detection when config has no command", () => {
    const dir = scratch({ "go.mod": "module x\n" });
    expect(resolveCommand(dir, "tests_pass", { build_cmd: "x" })).toBe("go test ./...");
  });
});
