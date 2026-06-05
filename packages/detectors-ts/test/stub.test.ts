import { describe, it, expect } from "vitest";
import {
  runDetectors,
  detectAuthentication,
  findRoutesInFile,
  DETECTOR_WARNINGS,
} from "../src/index.js";

describe("@attest/detectors-ts public surface", () => {
  it("exports runDetectors, detectAuthentication, findRoutesInFile, DETECTOR_WARNINGS", () => {
    expect(typeof runDetectors).toBe("function");
    expect(typeof detectAuthentication).toBe("function");
    expect(typeof findRoutesInFile).toBe("function");
    expect(Array.isArray(DETECTOR_WARNINGS)).toBe(true);
  });

  it("DETECTOR_WARNINGS includes the §6.5 advisory label", () => {
    const text = DETECTOR_WARNINGS.join(" ");
    expect(text).toMatch(/best-effort/);
    expect(text).toMatch(/not part of the core verdict/);
    expect(text).toMatch(/CI gates/);
  });
});
