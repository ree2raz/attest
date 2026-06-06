/**
 * Positive tests: the canonical manifest and verdict examples from SPEC §4.1/§4.2
 * must validate.
 */
import { describe, it, expect } from "vitest";
import { createManifestValidator, createVerdictValidator } from "../src/index.js";

const VALID_MANIFEST = {
  attest_version: "1.0",
  task: { id: "T-142", description: "Add login endpoint" },
  agent: { id: "claude-code", model: "claude-opus-4-8", tool_calls: 5 },
  generated_at: "2026-05-31T19:04:00Z",
  declared_scope: { files: ["src/routes/auth.ts", "tests/auth.test.ts"] },
  claims: [
    { id: "c1", kind: "file_change", op: "modify", path: "src/routes/auth.ts" },
    {
      id: "c2",
      kind: "symbol_added",
      path: "src/routes/auth.ts",
      symbol: "login",
      symbol_kind: "function",
    },
    { id: "c3", kind: "test_added", path: "tests/auth.test.ts", covers: "login" },
    { id: "c4", kind: "outcome", check: "tests_pass" },
    { id: "c5", kind: "outcome", check: "build_passes" },
  ],
};

const VALID_VERDICT = {
  attest_version: "1.0",
  task_id: "T-142",
  result: "fail",
  exit_code: 1,
  claims: [
    { id: "c1", status: "verified", evidence: { op: "modify", hunks: 2 } },
    { id: "c2", status: "verified", evidence: { node_kind: "function_declaration", line: 42 } },
    { id: "c3", status: "failed", reason: "no change detected in tests/auth.test.ts" },
    {
      id: "c4",
      status: "verified",
      evidence: { cmd: "npm test", exit_code: 0, duration_ms: 8123 },
    },
    { id: "c5", status: "verified", evidence: { cmd: "npm run build", exit_code: 0 } },
  ],
  undeclared_changes: [
    { path: "src/config/db.ts", op: "modify", granularity: "file", severity: "flag" },
  ],
  summary: { claims_total: 5, verified: 4, failed: 1, unverifiable: 0, undeclared: 1 },
};

describe("manifest validator — positive", () => {
  it("accepts the canonical §4.1 manifest", () => {
    const result = createManifestValidator().validate(VALID_MANIFEST);
    expect(result.ok).toBe(true);
  });

  it("returns the typed value on success", () => {
    const result = createManifestValidator().validate(VALID_MANIFEST);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.attest_version).toBe("1.0");
    expect(result.value.claims).toHaveLength(5);
  });

  it("accepts an unknown claim kind (handled downstream as unverifiable)", () => {
    const m = {
      ...VALID_MANIFEST,
      claims: [{ id: "c1", kind: "performance_improved", path: "src/x.ts" }],
    };
    const result = createManifestValidator().validate(m);
    expect(result.ok).toBe(true);
  });

  it("ignores a smuggled semantic description on a structural claim", () => {
    const m = {
      ...VALID_MANIFEST,
      claims: [
        {
          id: "c1",
          kind: "file_change",
          op: "modify",
          path: "src/x.ts",
          description: "authentication is now enforced everywhere",
        },
      ],
    };
    const result = createManifestValidator().validate(m);
    expect(result.ok).toBe(true);
  });

  it("omits optional agent fields", () => {
    const m = { ...VALID_MANIFEST, agent: { id: "claude-code" } };
    const result = createManifestValidator().validate(m);
    expect(result.ok).toBe(true);
  });
});

describe("verdict validator — positive", () => {
  it("accepts the canonical §4.2 verdict", () => {
    const result = createVerdictValidator().validate(VALID_VERDICT);
    expect(result.ok).toBe(true);
  });

  it("accepts an undeclared symbol-granularity change", () => {
    const v = {
      ...VALID_VERDICT,
      undeclared_changes: [
        {
          path: "src/config/db.ts",
          op: "modify",
          granularity: "symbol",
          severity: "flag",
          symbol: "connect",
          symbol_kind: "function",
        },
      ],
    };
    const result = createVerdictValidator().validate(v);
    expect(result.ok).toBe(true);
  });
});
