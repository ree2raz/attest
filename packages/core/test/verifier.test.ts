import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { verify } from "../src/verifier.js";
import type { Manifest } from "@attest/schema";
import { parseDiffContent } from "../src/diff.js";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const FIXTURES_DIR = join(__dirname, "fixtures", "basic");

/** Minimal valid session block */
const SESSION = {
  agent: "claude-code" as const,
  model: "claude-opus-4-7",
  session_id: "b3a1c0e2-9e2f-4e6a-8d13-1f2a3b4c5d6e",
  started_at: "2026-04-19T12:34:56Z",
  completed_at: "2026-04-19T12:41:22Z",
  prompt_hash: "sha256:a3f1c2e4b5d6f7a8c9e0b1d2f3a4c5e6b7d8f9a0c1e2b3d4f5a6c7e8b9d0f1a2",
  tool_calls_count: 1,
  files_touched: ["src/main.ts"],
};

const MANIFEST_BYTES = Buffer.from(JSON.stringify({ schema_version: "0.1" }));

const BASIC_DIFF = `\
diff --git a/src/main.ts b/src/main.ts
new file mode 100644
--- /dev/null
+++ b/src/main.ts
@@ -0,0 +1,2 @@
+export function foo(x: number): number { return x + 1; }
+export function unlistedHelper(): void {}
`;

describe("verify — routing", () => {
  it("cannot_verify always returns unverifiable", async () => {
    const manifest: Manifest = {
      schema_version: "0.1",
      session: SESSION,
      task: { summary: "test", source: "user_prompt" },
      claims: [
        {
          id: "c1",
          type: "refactor",
          target: { kind: "file", path: "src/main.ts" },
          description: "refactored",
          verification_contract: { check: "cannot_verify" },
        },
      ],
    };
    const report = await verify({
      manifest,
      manifestRawBytes: MANIFEST_BYTES,
      diff: parseDiffContent(BASIC_DIFF),
      repoRoot: FIXTURES_DIR,
      detectors: [],
    });
    expect(report.claims[0]!.verdict).toBe("unverifiable");
    expect(report.claims[0]!.reason_code).toBeUndefined();
  });

  it("behavior_present with no detector returns unverifiable/detector_not_implemented", async () => {
    const manifest: Manifest = {
      schema_version: "0.1",
      session: SESSION,
      task: { summary: "test", source: "user_prompt" },
      claims: [
        {
          id: "c1",
          type: "modify_behavior",
          target: { kind: "endpoint", path: "src/main.ts", symbol: "POST /login" },
          description: "added rate limiting",
          verification_contract: {
            check: "behavior_present",
            params: { property: "rate_limiting" },
          },
        },
      ],
    };
    const report = await verify({
      manifest,
      manifestRawBytes: MANIFEST_BYTES,
      diff: parseDiffContent(BASIC_DIFF),
      repoRoot: FIXTURES_DIR,
      detectors: [],
    });
    expect(report.claims[0]!.verdict).toBe("unverifiable");
    expect(report.claims[0]!.reason_code).toBe("detector_not_implemented");
  });

  it("symbol_exists on a function that exists returns verified", async () => {
    const manifest: Manifest = {
      schema_version: "0.1",
      session: { ...SESSION, files_touched: ["src/main.ts"] },
      task: { summary: "test", source: "user_prompt" },
      claims: [
        {
          id: "c1",
          type: "add_symbol",
          target: { kind: "function", path: "src/main.ts", symbol: "foo" },
          description: "added foo",
          verification_contract: { check: "symbol_exists" },
        },
      ],
    };
    const report = await verify({
      manifest,
      manifestRawBytes: MANIFEST_BYTES,
      diff: parseDiffContent(BASIC_DIFF),
      repoRoot: FIXTURES_DIR,
      detectors: [],
    });
    expect(report.claims[0]!.verdict).toBe("verified");
  });

  it("symbol_exists on a function that does not exist returns unverified (rule 2)", async () => {
    const manifest: Manifest = {
      schema_version: "0.1",
      session: { ...SESSION, files_touched: ["src/main.ts"] },
      task: { summary: "test", source: "user_prompt" },
      claims: [
        {
          id: "c1",
          type: "add_symbol",
          target: { kind: "function", path: "src/main.ts", symbol: "nonExistentFunction" },
          description: "added nonExistentFunction",
          verification_contract: { check: "symbol_exists" },
        },
      ],
    };
    const report = await verify({
      manifest,
      manifestRawBytes: MANIFEST_BYTES,
      diff: parseDiffContent(BASIC_DIFF),
      repoRoot: FIXTURES_DIR,
      detectors: [],
    });
    expect(report.claims[0]!.verdict).toBe("unverified");
  });
});

describe("verify — undeclared detection", () => {
  it("detects a file in diff but not in any claim", async () => {
    const manifest: Manifest = {
      schema_version: "0.1",
      // files_touched includes only src/main.ts but we also diff src/other.ts
      session: { ...SESSION, files_touched: ["src/main.ts"] },
      task: { summary: "test", source: "user_prompt" },
      claims: [
        {
          id: "c1",
          type: "add_symbol",
          target: { kind: "function", path: "src/main.ts", symbol: "foo" },
          description: "added foo",
          verification_contract: { check: "symbol_exists" },
        },
      ],
    };
    const diffWithExtra = BASIC_DIFF + `\
diff --git a/src/other.ts b/src/other.ts
new file mode 100644
--- /dev/null
+++ b/src/other.ts
@@ -0,0 +1,1 @@
+export const extra = 1;
`;
    const report = await verify({
      manifest,
      manifestRawBytes: MANIFEST_BYTES,
      diff: parseDiffContent(diffWithExtra),
      repoRoot: FIXTURES_DIR,
      detectors: [],
    });
    const undeclaredFiles = report.undeclared.filter((u) => u.type === "file").map((u) => u.path);
    expect(undeclaredFiles).toContain("src/other.ts");
  });

  it("manifest_hash is sha256: prefixed hex string", async () => {
    const rawManifest = readFileSync(
      join(FIXTURES_DIR, "..", "..", "..", "test", "fixtures", "basic", "manifest-stub.json"),
      "utf-8",
    ).trim();
    // Fallback: just check format from in-memory bytes
    const bytes = Buffer.from(rawManifest);
    const manifest: Manifest = {
      schema_version: "0.1",
      session: SESSION,
      task: { summary: "test", source: "user_prompt" },
      claims: [
        {
          id: "c1",
          type: "refactor",
          target: { kind: "file", path: "src/main.ts" },
          description: "refactored",
          verification_contract: { check: "cannot_verify" },
        },
      ],
    };
    const report = await verify({
      manifest,
      manifestRawBytes: bytes,
      diff: parseDiffContent(BASIC_DIFF),
      repoRoot: FIXTURES_DIR,
      detectors: [],
    });
    expect(report.manifest_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe("verify — hard-fail rule 5", () => {
  it("throws when files_touched contains a path outside repo root", async () => {
    const manifest: Manifest = {
      schema_version: "0.1",
      session: { ...SESSION, files_touched: ["../../etc/passwd"] },
      task: { summary: "test", source: "user_prompt" },
      claims: [
        {
          id: "c1",
          type: "refactor",
          target: { kind: "file", path: "src/main.ts" },
          description: "refactored",
          verification_contract: { check: "cannot_verify" },
        },
      ],
    };
    await expect(
      verify({
        manifest,
        manifestRawBytes: MANIFEST_BYTES,
        diff: parseDiffContent(BASIC_DIFF),
        repoRoot: FIXTURES_DIR,
        detectors: [],
      }),
    ).rejects.toThrow(/outside repo root/i);
  });
});
