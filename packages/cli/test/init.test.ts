import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createManifestValidator } from "@attest/schema";

const CLI = resolve(__dirname, "../dist/index.js");
const HAS_BUNDLED_CLI = existsSync(CLI);

const skipIfNoBundle = HAS_BUNDLED_CLI ? it : it.skip;

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function setupRepo(overlay: { files: Record<string, string>; diff: string }): string {
  const dir = mkdtempSync(join(tmpdir(), "attest-init-"));
  git(["init", "-q"], dir);
  git(["config", "user.email", "x@x"], dir);
  git(["config", "user.name", "x"], dir);
  for (const [rel, content] of Object.entries(overlay.files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf-8");
  }
  git(["add", "-A"], dir);
  git(["commit", "-qm", "base"], dir);
  execFileSync("git", ["apply", "-p1"], {
    cwd: dir,
    input: overlay.diff,
    stdio: ["pipe", "ignore", "ignore"],
  });
  return dir;
}

const TS_BASE = {
  files: {
    "src/auth.ts": `export function hashToken(token: string): string {
  let h = 0;
  for (const c of token) {
    h = (h * 31 + c.charCodeAt(0)) | 0;
  }
  return (h >>> 0).toString(16);
}
`,
  },
  diff: `diff --git a/src/auth.ts b/src/auth.ts
index db03973..a2d2cb1 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -5,3 +5,7 @@ export function hashToken(token: string): string {
   }
   return (h >>> 0).toString(16);
 }
+
+export function login(user: string, token: string): boolean {
+  return user.length > 0 && hashToken(token).length > 0;
+}
diff --git a/tests/auth.test.ts b/tests/auth.test.ts
new file mode 100644
index 0000000..4b2868f
--- /dev/null
+++ b/tests/auth.test.ts
@@ -0,0 +1,8 @@
+import { describe, it, expect } from "vitest";
+import { login } from "../src/auth.js";
+
+describe("login", () => {
+  it("accepts a non-empty user and token", () => {
+    expect(login("ada", "secret")).toBe(true);
+  });
+});
`,
};

describe("attest init", () => {
  describe("skeleton shape", () => {
    skipIfNoBundle("produces a structurally valid manifest from a TS diff", async () => {
      const dir = setupRepo(TS_BASE);
      const diffPath = join(dir, "change.diff");
      writeFileSync(diffPath, TS_BASE.diff, "utf-8");
      const manifestPath = join(dir, ".attest", "manifest.json");
      execFileSync(
        "node",
        [CLI, "init", "--repo-root", dir, "--diff", diffPath, "--out", manifestPath],
        { stdio: "pipe" },
      );
      const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const validation = createManifestValidator().validate(raw);
      expect(validation.ok).toBe(true);
      if (!validation.ok) return;

      const m = validation.value;
      expect(m.attest_version).toBe("1.0");
      expect(m.declared_scope.files).toEqual(["src/auth.ts", "tests/auth.test.ts"]);
      expect(m.claims.length).toBeGreaterThanOrEqual(4);

      const kinds = m.claims.map((c) => c.kind);
      expect(kinds).toContain("file_change");
      expect(kinds).toContain("symbol_added");
      expect(kinds).toContain("test_added");

      const symbolAdded = m.claims.find(
        (c) => c.kind === "symbol_added" && c.path === "src/auth.ts",
      );
      if (symbolAdded && symbolAdded.kind === "symbol_added") {
        expect(symbolAdded.symbol).toBe("login");
        expect(symbolAdded.symbol_kind).toBe("function");
      }
    });

    skipIfNoBundle("uses the default description placeholder", () => {
      const dir = setupRepo(TS_BASE);
      const diffPath = join(dir, "change.diff");
      writeFileSync(diffPath, TS_BASE.diff, "utf-8");
      const manifestPath = join(dir, ".attest", "manifest.json");
      execFileSync(
        "node",
        [CLI, "init", "--repo-root", dir, "--diff", diffPath, "--out", manifestPath],
        { stdio: "pipe" },
      );
      const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
      expect(raw.task.description).toBe("<unspecified — fill in>");
    });

    skipIfNoBundle("honors --task, --description, --agent", () => {
      const dir = setupRepo(TS_BASE);
      const diffPath = join(dir, "change.diff");
      writeFileSync(diffPath, TS_BASE.diff, "utf-8");
      const manifestPath = join(dir, ".attest", "manifest.json");
      execFileSync(
        "node",
        [
          CLI,
          "init",
          "--repo-root",
          dir,
          "--diff",
          diffPath,
          "--out",
          manifestPath,
          "--task",
          "add-login",
          "--description",
          "Add login() to auth and a test",
          "--agent",
          "claude-code",
        ],
        { stdio: "pipe" },
      );
      const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
      expect(raw.task.id).toBe("add-login");
      expect(raw.task.description).toBe("Add login() to auth and a test");
      expect(raw.agent.id).toBe("claude-code");
    });

    skipIfNoBundle("produces a claim id sequence c1, c2, c3, ...", () => {
      const dir = setupRepo(TS_BASE);
      const diffPath = join(dir, "change.diff");
      writeFileSync(diffPath, TS_BASE.diff, "utf-8");
      const manifestPath = join(dir, ".attest", "manifest.json");
      execFileSync(
        "node",
        [CLI, "init", "--repo-root", dir, "--diff", diffPath, "--out", manifestPath],
        { stdio: "pipe" },
      );
      const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const ids = raw.claims.map((c: { id: string }) => c.id);
      expect(ids).toEqual(ids.slice().sort());
      for (let i = 0; i < ids.length; i++) {
        expect(ids[i]).toBe(`c${i + 1}`);
      }
    });
  });

  describe("error paths", () => {
    skipIfNoBundle("fails on an empty diff", () => {
      const dir = mkdtempSync(join(tmpdir(), "attest-init-empty-"));
      git(["init", "-q"], dir);
      git(["config", "user.email", "x@x"], dir);
      git(["config", "user.name", "x"], dir);
      writeFileSync(join(dir, "README.md"), "x\n", "utf-8");
      git(["add", "-A"], dir);
      git(["commit", "-qm", "base"], dir);
      try {
        execFileSync("node", [CLI, "init", "--repo-root", dir], { stdio: "pipe" });
        expect.fail("should have exited non-zero");
      } catch (e) {
        const err = e as { status?: number; stderr?: Buffer };
        expect(err.status).toBe(65);
        expect(String(err.stderr)).toMatch(/diff is empty/);
      }
    });

    skipIfNoBundle("fails when --repo-root does not exist", () => {
      try {
        execFileSync("node", [CLI, "init", "--repo-root", "/nonexistent/xyz/abc"], {
          stdio: "pipe",
        });
        expect.fail("should have exited non-zero");
      } catch (e) {
        const err = e as { status?: number; stderr?: Buffer };
        expect(err.status).toBe(66);
        expect(String(err.stderr)).toMatch(/repo-root not found/);
      }
    });
  });
});
