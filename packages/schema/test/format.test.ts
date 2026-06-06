/**
 * Tests for formatValidationError — the legible error formatter used by the CLI
 * (MVP WU14). The point is to keep CI logs readable: one path-pointed line per
 * error, with a targeted fix message instead of an ajv dump.
 */
import { describe, it, expect } from "vitest";
import {
  createManifestValidator,
  formatValidationError,
  formatValidationErrors,
  type ValidationError,
} from "../src/index.js";

function findError(errors: ValidationError[], fragment: string): ValidationError | undefined {
  return errors.find((e) => e.path.includes(fragment) || e.message.includes(fragment));
}

describe("formatValidationError", () => {
  it("formats a wrong attest_version with the expected value", () => {
    const r = createManifestValidator().validate({
      attest_version: "0.1",
      task: { id: "T-1", description: "x" },
      agent: { id: "claude-code" },
      generated_at: "2026-06-06T00:00:00Z",
      declared_scope: { files: ["src/foo.ts"] },
      claims: [{ id: "c1", kind: "file_change", op: "modify", path: "src/foo.ts" }],
    });
    if (r.ok) throw new Error("expected validation failure");
    const err = findError(r.errors, "attest_version")!;
    const line = formatValidationError(err);
    expect(line).toMatch(/^attest_version:/);
    expect(line).toContain("1.0");
  });

  it("formats an unknown top-level field with the closed shape hint", () => {
    const r = createManifestValidator().validate({
      attest_version: "1.0",
      task: { id: "T-1", description: "x" },
      agent: { id: "claude-code" },
      generated_at: "2026-06-06T00:00:00Z",
      declared_scope: { files: ["src/foo.ts"] },
      claims: [{ id: "c1", kind: "file_change", op: "modify", path: "src/foo.ts" }],
      bogus: 42,
    });
    if (r.ok) throw new Error("expected validation failure");
    const line = formatValidationError(r.errors[0]!);
    expect(line).toMatch(/unknown top-level field/);
    expect(line).toContain("bogus");
  });

  it("formats a missing required field on a claim", () => {
    const r = createManifestValidator().validate({
      attest_version: "1.0",
      task: { id: "T-1", description: "x" },
      agent: { id: "claude-code" },
      generated_at: "2026-06-06T00:00:00Z",
      declared_scope: { files: ["src/foo.ts"] },
      claims: [{ id: "c1", kind: "file_change", path: "src/foo.ts" } as never],
    });
    if (r.ok) throw new Error("expected validation failure");
    const err = findError(r.errors, "claims/0")!;
    const line = formatValidationError(err);
    expect(line).toMatch(/^claims\/0:/);
    expect(line).toContain('"op"');
  });

  it("formats a malformed claim id with the pattern hint", () => {
    const r = createManifestValidator().validate({
      attest_version: "1.0",
      task: { id: "T-1", description: "x" },
      agent: { id: "claude-code" },
      generated_at: "2026-06-06T00:00:00Z",
      declared_scope: { files: ["src/foo.ts"] },
      claims: [{ id: "claim-1", kind: "file_change", op: "modify", path: "src/foo.ts" }],
    });
    if (r.ok) throw new Error("expected validation failure");
    const err = findError(r.errors, "/id")!;
    const line = formatValidationError(err);
    expect(line).toMatch(/^claims\/0\/id:/);
    expect(line).toContain("^c[0-9]+$");
  });

  it("formats an unknown file_change op with the allowed set", () => {
    const r = createManifestValidator().validate({
      attest_version: "1.0",
      task: { id: "T-1", description: "x" },
      agent: { id: "claude-code" },
      generated_at: "2026-06-06T00:00:00Z",
      declared_scope: { files: ["src/foo.ts"] },
      claims: [{ id: "c1", kind: "file_change", op: "rename", path: "src/foo.ts" } as never],
    });
    if (r.ok) throw new Error("expected validation failure");
    const err = findError(r.errors, "/op")!;
    const line = formatValidationError(err);
    expect(line).toMatch(/^claims\/0\/op:/);
    expect(line).toContain("create");
    expect(line).toContain("modify");
    expect(line).toContain("delete");
  });

  it("formats an unknown outcome.check with the allowed set", () => {
    const r = createManifestValidator().validate({
      attest_version: "1.0",
      task: { id: "T-1", description: "x" },
      agent: { id: "claude-code" },
      generated_at: "2026-06-06T00:00:00Z",
      declared_scope: { files: ["src/foo.ts"] },
      claims: [{ id: "c1", kind: "outcome", check: "deploy_succeeds" } as never],
    });
    if (r.ok) throw new Error("expected validation failure");
    const err = findError(r.errors, "/check")!;
    const line = formatValidationError(err);
    expect(line).toMatch(/^claims\/0\/check:/);
    expect(line).toContain("build_passes");
    expect(line).toContain("tests_pass");
    expect(line).toContain("lint_passes");
  });

  it("formats an empty claims array with the reason", () => {
    const r = createManifestValidator().validate({
      attest_version: "1.0",
      task: { id: "T-1", description: "x" },
      agent: { id: "claude-code" },
      generated_at: "2026-06-06T00:00:00Z",
      declared_scope: { files: ["src/foo.ts"] },
      claims: [],
    });
    if (r.ok) throw new Error("expected validation failure");
    const line = formatValidationError(r.errors[0]!);
    expect(line).toMatch(/at least one claim/);
  });

  it("formats a non-RFC3339 generated_at with the format hint", () => {
    const r = createManifestValidator().validate({
      attest_version: "1.0",
      task: { id: "T-1", description: "x" },
      agent: { id: "claude-code" },
      generated_at: "yesterday",
      declared_scope: { files: ["src/foo.ts"] },
      claims: [{ id: "c1", kind: "file_change", op: "modify", path: "src/foo.ts" }],
    });
    if (r.ok) throw new Error("expected validation failure");
    const err = findError(r.errors, "generated_at")!;
    const line = formatValidationError(err);
    expect(line).toMatch(/^generated_at:/);
    expect(line).toContain("RFC 3339");
  });

  it("returns one line per error and never JSON-dumps", () => {
    const r = createManifestValidator().validate({ attest_version: "0.1" });
    if (r.ok) throw new Error("expected validation failure");
    for (const err of r.errors) {
      const line = formatValidationError(err);
      expect(line.includes("\n")).toBe(false);
      expect(line).toMatch(/^[a-zA-Z/(]/);
    }
  });

  it("filters residual ajv if/then markers (more specific errors take their place)", () => {
    // Multiple enum failures on claims/0 trigger both the enum error AND ajv's
    // if/then "must match then schema" noise. The batch helper must drop the
    // noise so the user sees the targeted fix message, not a wall of `if`.
    const r = createManifestValidator().validate({
      attest_version: "1.0",
      task: { id: "T-1", description: "x" },
      agent: { id: "claude-code" },
      generated_at: "2026-06-06T00:00:00Z",
      declared_scope: { files: ["src/foo.ts"] },
      claims: [{ id: "c1", kind: "file_change", op: "rename", path: "src/foo.ts" } as never],
    });
    if (r.ok) throw new Error("expected validation failure");
    const lines = formatValidationErrors(r.errors);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => !l.includes("[if]"))).toBe(true);
    expect(lines.every((l) => l.length > 0)).toBe(true);
  });
});
