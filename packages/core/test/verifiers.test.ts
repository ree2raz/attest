import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDiff } from "@attest/diff";
import type { Claim } from "@attest/schema";
import { Sources, verifyClaim } from "../src/index.js";
import type { ClaimContext, OutcomeResults } from "../src/index.js";

const emptyDiff = parseDiff("");

async function run(
  claim: Claim,
  ctx: Partial<ClaimContext> & { diff?: ReturnType<typeof parseDiff> },
) {
  const full: ClaimContext = {
    diff: ctx.diff ?? emptyDiff,
    sources: ctx.sources ?? new Sources(tmpdir(), ctx.diff ?? emptyDiff),
    config: ctx.config,
    outcomes: ctx.outcomes,
  };
  return verifyClaim(claim, full);
}

describe("file_change verifier", () => {
  const diff = parseDiff(
    ["diff --git a/x.ts b/x.ts", "--- a/x.ts", "+++ b/x.ts", "@@ -1 +1,2 @@", " a", "+b", ""].join(
      "\n",
    ),
  );

  it("verifies a matching op", async () => {
    const r = await run({ id: "c1", kind: "file_change", op: "modify", path: "x.ts" }, { diff });
    expect(r.status).toBe("verified");
  });

  it("fails when the op does not match", async () => {
    const r = await run({ id: "c1", kind: "file_change", op: "create", path: "x.ts" }, { diff });
    expect(r.status).toBe("failed");
    expect(r.reason).toMatch(/expected create/);
  });

  it("fails when the path is absent from the diff", async () => {
    const r = await run(
      { id: "c1", kind: "file_change", op: "modify", path: "other.ts" },
      { diff },
    );
    expect(r.status).toBe("failed");
    expect(r.reason).toMatch(/no change detected/);
  });
});

describe("symbol verifiers (added / removed / modified)", () => {
  // A base file with two functions; the diff modifies one, removes the other, adds a third.
  const base = `export function keep() {
  return 1;
}
export function gone() {
  return 2;
}
`;
  const diff = parseDiff(
    [
      "diff --git a/m.ts b/m.ts",
      "--- a/m.ts",
      "+++ b/m.ts",
      "@@ -1,6 +1,6 @@",
      " export function keep() {",
      "-  return 1;",
      "+  return 9;",
      " }",
      "-export function gone() {",
      "-  return 2;",
      "-}",
      "+export function fresh() {",
      "+  return 3;",
      "+}",
      "",
    ].join("\n"),
  );

  function sourcesWithBase(): Sources {
    const dir = mkdtempSync(join(tmpdir(), "attest-core-"));
    writeFileSync(join(dir, "m.ts"), base);
    return new Sources(dir, diff);
  }

  it("verifies symbol_added / symbol_removed / symbol_modified when true", async () => {
    const sources = sourcesWithBase();
    const added = await run(
      { id: "a", kind: "symbol_added", path: "m.ts", symbol: "fresh", symbol_kind: "function" },
      { diff, sources },
    );
    const removed = await run(
      { id: "r", kind: "symbol_removed", path: "m.ts", symbol: "gone", symbol_kind: "function" },
      { diff, sources },
    );
    const modified = await run(
      { id: "m", kind: "symbol_modified", path: "m.ts", symbol: "keep", symbol_kind: "function" },
      { diff, sources },
    );
    expect([added.status, removed.status, modified.status]).toEqual([
      "verified",
      "verified",
      "verified",
    ]);
  });

  it("fails a symbol claim that does not hold (kept symbol claimed as removed)", async () => {
    const sources = sourcesWithBase();
    const r = await run(
      { id: "r", kind: "symbol_removed", path: "m.ts", symbol: "keep", symbol_kind: "function" },
      { diff, sources },
    );
    expect(r.status).toBe("failed");
    expect(r.reason).toMatch(/'keep' \(function\) was not removed/);
  });
});

describe("test verifier", () => {
  const testDiff = parseDiff(
    [
      "diff --git a/foo.test.ts b/foo.test.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/foo.test.ts",
      "@@ -0,0 +1,2 @@",
      "+import { login } from './auth';",
      "+test('login', () => login());",
      "",
    ].join("\n"),
  );

  it("verifies a covering test that references the symbol", async () => {
    const r = await run(
      { id: "c", kind: "test_added", path: "foo.test.ts", covers: "login" },
      { diff: testDiff },
    );
    expect(r.status).toBe("verified");
  });

  it("is unverifiable when covers is not referenced (never a guess)", async () => {
    const r = await run(
      { id: "c", kind: "test_added", path: "foo.test.ts", covers: "logout" },
      { diff: testDiff },
    );
    expect(r.status).toBe("unverifiable");
    expect(r.reason).toMatch(/could not structurally confirm/);
  });

  it("is unverifiable when the path is not a recognized test file", async () => {
    const srcDiff = parseDiff(
      [
        "diff --git a/src/x.ts b/src/x.ts",
        "--- a/src/x.ts",
        "+++ b/src/x.ts",
        "@@ -1 +1,2 @@",
        " a",
        "+b",
        "",
      ].join("\n"),
    );
    const r = await run({ id: "c", kind: "test_added", path: "src/x.ts" }, { diff: srcDiff });
    expect(r.status).toBe("unverifiable");
    expect(r.reason).toMatch(/not recognized as a test file/);
  });

  it("fails when the test path has no change", async () => {
    const r = await run({ id: "c", kind: "test_added", path: "missing.test.ts" }, {});
    expect(r.status).toBe("failed");
    expect(r.reason).toMatch(/no change detected/);
  });
});

describe("outcome verifier", () => {
  const outcomes: OutcomeResults = { tests_pass: { passed: false, exitCode: 1 } };

  it("fails when the injected outcome did not pass", async () => {
    const r = await run({ id: "c", kind: "outcome", check: "tests_pass" }, { outcomes });
    expect(r.status).toBe("failed");
    expect(r.reason).toMatch(/tests_pass not satisfied/);
  });

  it("verifies when the injected outcome passed", async () => {
    const r = await run(
      { id: "c", kind: "outcome", check: "build_passes" },
      { outcomes: { build_passes: { passed: true, exitCode: 0 } } },
    );
    expect(r.status).toBe("verified");
  });

  it("is unverifiable when no runner result is available", async () => {
    const r = await run({ id: "c", kind: "outcome", check: "lint_passes" }, {});
    expect(r.status).toBe("unverifiable");
    expect(r.reason).toMatch(/was not executed/);
  });
});

describe("unsupported / behavioral claim", () => {
  it("is unverifiable with an LLM-review pointer, never failed", async () => {
    const r = await run({ id: "c", kind: "behavior_present" } as unknown as Claim, {});
    expect(r.status).toBe("unverifiable");
    expect(r.reason).toMatch(/unsupported_claim_kind/);
    expect(r.reason).toMatch(/review/);
  });
});
