import type { Claim } from "@attest/schema";
import type { Evidence, Verdict } from "@attest/core";

export interface DetectorContext {
  repoRoot: string;
  postDiffFile: (path: string) => Promise<string | null>;
}

export interface DetectorVerdict {
  verdict: Verdict;
  reason_code?: string;
  evidence: Evidence[];
}

export interface Detector {
  id: string;
  canHandle(claim: Claim): boolean;
  run(claim: Claim, ctx: DetectorContext): Promise<DetectorVerdict>;
}

/** Returns all registered detectors. Populated in subsequent commits. */
export function registerDetectors(): Detector[] {
  return [];
}
