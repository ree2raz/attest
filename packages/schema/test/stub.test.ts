import { describe, it, expect } from "vitest";
import { ATTEST_VERSION, KNOWN_CLAIM_KINDS } from "../src/index.js";

describe("@attest/schema scaffold", () => {
  it("exports ATTEST_VERSION", () => {
    expect(ATTEST_VERSION).toBe("1.0");
  });

  it("exposes the closed v1.0 claim taxonomy", () => {
    expect(KNOWN_CLAIM_KINDS).toEqual([
      "file_change",
      "symbol_added",
      "symbol_removed",
      "symbol_modified",
      "test_added",
      "test_modified",
      "outcome",
    ]);
  });
});
