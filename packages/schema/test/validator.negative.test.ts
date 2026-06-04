/**
 * Negative tests: structural violations of the v1.0 manifest and verdict schemas.
 * Validation is purely structural — there is NO semantic layer (the v0.1
 * behavior_present params check is gone with the semantic model).
 */
import { describe, it, expect } from "vitest";
import { createManifestValidator, createVerdictValidator } from "../src/index.js";

const BASE_MANIFEST = {
  attest_version: "1.0",
  task: { id: "T-1", description: "test" },
  agent: { id: "claude-code" },
  generated_at: "2026-05-31T19:04:00Z",
  declared_scope: { files: ["src/foo.ts"] },
  claims: [{ id: "c1", kind: "file_change", op: "modify", path: "src/foo.ts" }],
};

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

describe("manifest validator — negative", () => {
  it("rejects an unknown top-level field (additionalProperties)", () => {
    const result = createManifestValidator().validate({ ...clone(BASE_MANIFEST), extra: 1 });
    expect(result.ok).toBe(false);
  });

  it("rejects a wrong attest_version", () => {
    const result = createManifestValidator().validate({
      ...clone(BASE_MANIFEST),
      attest_version: "0.1",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-date-time generated_at", () => {
    const bad = clone(BASE_MANIFEST);
    bad.generated_at = "yesterday";
    const result = createManifestValidator().validate(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty claims array", () => {
    const result = createManifestValidator().validate({ ...clone(BASE_MANIFEST), claims: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed claim id", () => {
    const bad = clone(BASE_MANIFEST);
    bad.claims = [{ id: "claim-1", kind: "file_change", op: "modify", path: "src/foo.ts" }];
    const result = createManifestValidator().validate(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects a file_change claim missing its op", () => {
    const bad = clone(BASE_MANIFEST);
    bad.claims = [{ id: "c1", kind: "file_change", path: "src/foo.ts" } as never];
    const result = createManifestValidator().validate(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes("op") || e.code === "required")).toBe(true);
  });

  it("rejects a file_change claim with an invalid op", () => {
    const bad = clone(BASE_MANIFEST);
    bad.claims = [{ id: "c1", kind: "file_change", op: "rename", path: "src/foo.ts" } as never];
    const result = createManifestValidator().validate(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects a symbol_added claim missing symbol_kind", () => {
    const bad = clone(BASE_MANIFEST);
    bad.claims = [{ id: "c1", kind: "symbol_added", path: "src/foo.ts", symbol: "foo" } as never];
    const result = createManifestValidator().validate(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects a symbol claim with an unknown symbol_kind", () => {
    const bad = clone(BASE_MANIFEST);
    bad.claims = [
      {
        id: "c1",
        kind: "symbol_added",
        path: "src/foo.ts",
        symbol: "foo",
        symbol_kind: "macro",
      } as never,
    ];
    const result = createManifestValidator().validate(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects an outcome claim with an unknown check", () => {
    const bad = clone(BASE_MANIFEST);
    bad.claims = [{ id: "c1", kind: "outcome", check: "deploy_succeeds" } as never];
    const result = createManifestValidator().validate(bad);
    expect(result.ok).toBe(false);
  });

  it("emits errors with path, code, and message", () => {
    const result = createManifestValidator().validate({ attest_version: "1.0" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors[0];
    expect(err).toHaveProperty("path");
    expect(err).toHaveProperty("code");
    expect(err).toHaveProperty("message");
  });
});

const BASE_VERDICT = {
  attest_version: "1.0",
  task_id: "T-1",
  result: "pass",
  exit_code: 0,
  claims: [{ id: "c1", status: "verified", evidence: { op: "modify" } }],
  undeclared_changes: [],
  summary: { claims_total: 1, verified: 1, failed: 0, unverifiable: 0, undeclared: 0 },
};

describe("verdict validator — negative", () => {
  it("rejects an invalid result value", () => {
    const result = createVerdictValidator().validate({ ...clone(BASE_VERDICT), result: "maybe" });
    expect(result.ok).toBe(false);
  });

  it("rejects an exit_code outside {0,1}", () => {
    const result = createVerdictValidator().validate({ ...clone(BASE_VERDICT), exit_code: 2 });
    expect(result.ok).toBe(false);
  });

  it("rejects a failed claim with no reason", () => {
    const bad = clone(BASE_VERDICT);
    bad.claims = [{ id: "c1", status: "failed" } as never];
    const result = createVerdictValidator().validate(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects an unverifiable claim with no reason (must carry the review pointer)", () => {
    const bad = clone(BASE_VERDICT);
    bad.claims = [{ id: "c1", status: "unverifiable" } as never];
    const result = createVerdictValidator().validate(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects a symbol-granularity undeclared change with no symbol", () => {
    const bad = clone(BASE_VERDICT);
    bad.undeclared_changes = [
      { path: "src/x.ts", op: "modify", granularity: "symbol", severity: "flag" } as never,
    ];
    const result = createVerdictValidator().validate(bad);
    expect(result.ok).toBe(false);
  });
});
