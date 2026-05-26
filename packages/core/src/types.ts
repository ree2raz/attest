import type { Manifest } from "@attest/schema";
import type { Detector } from "./detector.js";

export type Verdict = "verified" | "unverified" | "partial" | "unverifiable";

/** Reason codes emitted by the verifier routing layer (not by individual detectors). */
export type CoreReasonCode = "detector_not_implemented" | "unsupported_check";

export interface Evidence {
  kind: string;
  path?: string;
  symbol?: string;
  note?: string;
}

export interface ClaimResult {
  claim_id: string;
  verdict: Verdict;
  /** Either a CoreReasonCode or a detector-specific reason code. */
  reason_code?: string;
  evidence: Evidence[];
}

export interface UndeclaredFinding {
  type: "file" | "symbol";
  path: string;
  symbol?: string;
}

export interface VerdictReport {
  manifest_hash: string;
  summary: {
    total_claims: number;
    verified: number;
    unverified: number;
    partial: number;
    unverifiable: number;
    undeclared_files: number;
    undeclared_symbols: number;
  };
  claims: ClaimResult[];
  undeclared: UndeclaredFinding[];
  reviewer_focus: Array<{ claim_id?: string; undeclared?: UndeclaredFinding; reason: string }>;
}

export interface DiffChange {
  path: string;
  kind: "added" | "modified" | "deleted";
  hunks: unknown[];
}

export interface DiffSet {
  changes: DiffChange[];
}

export interface VerifyInput {
  manifest: Manifest;
  /** Raw bytes of the manifest file; used to compute manifest_hash via SHA-256. */
  manifestRawBytes: Uint8Array;
  diff: DiffSet;
  repoRoot: string;
  /** Detector registry, injected by the CLI after importing @attest/detectors-ts. */
  detectors: Detector[];
}
