/**
 * Negative tests: hard-fail rules 1, 3, 4 from SCHEMA_V0.1.md §9.
 * Rules 2 and 5 require diff + repo context and are tested in @attest/core.
 *
 * Rule 1: manifest fails JSON Schema validation
 * Rule 3: verification_contract.check = "behavior_present" but params.property not in enum
 * Rule 4: claims array is empty
 */
import { describe, it, expect } from "vitest";
import { createValidator } from "../src/index.js";

/** Minimal valid base to mutate per test */
const BASE = {
  schema_version: "0.1",
  session: {
    agent: "claude-code",
    model: "claude-opus-4-7",
    session_id: "b3a1c0e2-9e2f-4e6a-8d13-1f2a3b4c5d6e",
    started_at: "2026-04-19T12:34:56Z",
    completed_at: "2026-04-19T12:41:22Z",
    prompt_hash: "sha256:a3f1c2e4b5d6f7a8c9e0b1d2f3a4c5e6b7d8f9a0c1e2b3d4f5a6c7e8b9d0f1a2",
    tool_calls_count: 0,
    files_touched: [],
  },
  task: { summary: "test", source: "user_prompt" },
  claims: [
    {
      id: "c1",
      type: "add_symbol",
      target: { kind: "function", path: "src/foo.ts", symbol: "foo" },
      description: "adds foo",
      verification_contract: { check: "symbol_exists" },
    },
  ],
};

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

describe("validator — negative (hard-fail rules 1, 3, 4)", () => {
  // Rule 1: manifest fails JSON Schema validation
  it("rule 1a — rejects unknown top-level field (additionalProperties)", () => {
    const bad = { ...clone(BASE), extra_field: "not allowed" };
    const result = createValidator().validate(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rule 1b — rejects wrong schema_version", () => {
    const bad = { ...clone(BASE), schema_version: "0.2" };
    const result = createValidator().validate(bad);
    expect(result.ok).toBe(false);
  });

  it("rule 1c — rejects invalid prompt_hash format", () => {
    const bad = clone(BASE);
    bad.session.prompt_hash = "not-a-sha256-hash";
    const result = createValidator().validate(bad);
    expect(result.ok).toBe(false);
  });

  it("rule 1d — rejects non-uuid session_id", () => {
    const bad = clone(BASE);
    bad.session.session_id = "not-a-uuid";
    const result = createValidator().validate(bad);
    expect(result.ok).toBe(false);
  });

  // Rule 3: behavior_present with params.property not in behavioral_property enum
  it("rule 3 — rejects behavior_present with unknown params.property", () => {
    const bad = clone(BASE);
    bad.claims[0] = {
      id: "c1",
      type: "modify_behavior",
      target: { kind: "endpoint", path: "src/routes/auth.ts", symbol: "POST /login" },
      description: "adds something",
      verification_contract: {
        check: "behavior_present",
        params: { property: "definitely_not_a_real_property" },
      },
    };
    const result = createValidator().validate(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path.includes("property"))).toBe(true);
  });

  // Rule 4: claims array is empty
  it("rule 4 — rejects empty claims array", () => {
    const bad = { ...clone(BASE), claims: [] };
    const result = createValidator().validate(bad);
    expect(result.ok).toBe(false);
  });

  // Sanity: errors include path + code + message
  it("errors have required shape (path, code, message)", () => {
    const result = createValidator().validate({ schema_version: "0.1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const err = result.errors[0];
    expect(err).toHaveProperty("path");
    expect(err).toHaveProperty("code");
    expect(err).toHaveProperty("message");
  });
});
