import { describe, it, expect } from "vitest";
import type { Verdict } from "../src/index.js";

describe("@attest/core scaffold", () => {
  it("Verdict type is defined", () => {
    const v: Verdict = "verified";
    expect(v).toBe("verified");
  });
});
