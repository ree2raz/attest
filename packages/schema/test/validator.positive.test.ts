/**
 * Positive test: the canonical example manifest from SCHEMA_V0.1.md §10 must validate.
 */
import { describe, it, expect } from "vitest";
import { createValidator } from "../src/index.js";

const VALID_MANIFEST = {
  schema_version: "0.1",
  session: {
    agent: "claude-code",
    model: "claude-opus-4-7",
    session_id: "b3a1c0e2-9e2f-4e6a-8d13-1f2a3b4c5d6e",
    started_at: "2026-04-19T12:34:56Z",
    completed_at: "2026-04-19T12:41:22Z",
    prompt_hash: "sha256:a3f1c2e4b5d6f7a8c9e0b1d2f3a4c5e6b7d8f9a0c1e2b3d4f5a6c7e8b9d0f1a2",
    tool_calls_count: 23,
    files_touched: [
      "src/auth/email.ts",
      "src/routes/auth.ts",
      "src/auth/email.test.ts",
      "package.json",
    ],
  },
  task: {
    summary: "Add email verification flow with rate-limited /verify endpoint",
    source: "user_prompt",
  },
  claims: [
    {
      id: "c1",
      type: "add_symbol",
      target: { kind: "class", path: "src/auth/email.ts", symbol: "EmailVerificationService" },
      description: "Service for generating and validating email tokens (15-min TTL)",
      verification_contract: { check: "symbol_exists" },
    },
    {
      id: "c2",
      type: "add_symbol",
      target: { kind: "endpoint", path: "src/routes/auth.ts", symbol: "POST /verify" },
      description: "Route that validates a token and activates the user",
      verification_contract: { check: "symbol_exists" },
    },
    {
      id: "c3",
      type: "modify_behavior",
      target: { kind: "endpoint", path: "src/routes/auth.ts", symbol: "POST /verify" },
      description: "Applied rate limiting to prevent brute-force token guessing",
      verification_contract: { check: "behavior_present", params: { property: "rate_limiting" } },
    },
    {
      id: "c4",
      type: "add_test",
      target: { kind: "file", path: "src/auth/email.test.ts" },
      description: "Unit tests for EmailVerificationService token generation and expiry",
      verification_contract: {
        check: "test_covers",
        params: { subject_symbol: "EmailVerificationService" },
      },
    },
  ],
};

describe("validator — positive", () => {
  it("accepts the canonical example manifest", () => {
    const v = createValidator();
    const result = v.validate(VALID_MANIFEST);
    expect(result.ok).toBe(true);
  });

  it("returned manifest matches the input shape", () => {
    const v = createValidator();
    const result = v.validate(VALID_MANIFEST);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.manifest.schema_version).toBe("0.1");
    expect(result.manifest.session.agent).toBe("claude-code");
    expect(result.manifest.claims).toHaveLength(4);
  });
});
