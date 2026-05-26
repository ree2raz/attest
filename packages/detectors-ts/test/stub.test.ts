import { describe, it, expect } from "vitest";
import { registerDetectors } from "../src/index.js";

describe("@attest/detectors-ts scaffold", () => {
  it("registerDetectors returns an array", () => {
    expect(Array.isArray(registerDetectors())).toBe(true);
  });
});
