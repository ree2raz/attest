/**
 * Detector interface — defined in @attest/core so verify() can dispatch to detectors
 * without a circular dependency.  @attest/detectors-ts imports and re-exports these.
 */
import type { Claim } from "@attest/schema";
import type { Evidence, Verdict } from "./types.js";

export interface DetectorContext {
  repoRoot: string;
  /** Returns post-diff content of the file, or null if the file was deleted. */
  postDiffFile: (path: string) => Promise<string | null>;
}

export interface DetectorVerdict {
  verdict: Verdict;
  reason_code?: string;
  evidence: Evidence[];
}

export interface Detector {
  /** Unique identifier, e.g. "ts.behavior.authentication" */
  id: string;
  /** Returns true if this detector can handle the given claim. */
  canHandle(claim: Claim): boolean;
  /** Runs the detection and returns a verdict. */
  run(claim: Claim, ctx: DetectorContext): Promise<DetectorVerdict>;
}
