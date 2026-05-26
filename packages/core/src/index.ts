// @attest/core — stub exports (full implementation in subsequent commits)
import type { Manifest } from "@attest/schema";

export type Verdict = "verified" | "unverified" | "partial" | "unverifiable";

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
  post_content?: string;
  hunks: unknown[];
}

export interface DiffSet {
  changes: DiffChange[];
}

export interface VerifyInput {
  manifest: Manifest;
  manifestRawBytes: Uint8Array;
  diff: DiffSet;
  repoRoot: string;
}

export async function verify(_input: VerifyInput): Promise<VerdictReport> {
  throw new Error("verify: not yet implemented");
}
