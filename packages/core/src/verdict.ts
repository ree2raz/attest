import { createHash } from "node:crypto";
import type { ClaimResult, UndeclaredFinding, VerdictReport } from "./types.js";

/**
 * Computes SHA-256 of the raw manifest bytes and returns the hash prefixed with "sha256:".
 */
export function computeManifestHash(manifestRawBytes: Uint8Array): string {
  const hex = createHash("sha256").update(manifestRawBytes).digest("hex");
  return `sha256:${hex}`;
}

/**
 * Builds the reviewer_focus array per the spec ordering:
 *   1. Unverified/partial claims (in claim-id order)
 *   2. Undeclared items (path+symbol lexicographic order)
 */
export function buildReviewerFocus(
  claims: ClaimResult[],
  undeclared: UndeclaredFinding[],
): VerdictReport["reviewer_focus"] {
  const focus: VerdictReport["reviewer_focus"] = [];

  // 1. Unverified and partial claims, in claim-id order
  for (const claim of claims) {
    if (claim.verdict === "unverified" || claim.verdict === "partial") {
      const reason = buildClaimReason(claim);
      focus.push({ claim_id: claim.claim_id, reason });
    }
  }

  // 2. Undeclared items, path+symbol lexicographic order (already sorted by caller)
  for (const item of undeclared) {
    const reason = buildUndeclaredReason(item);
    focus.push({ undeclared: item, reason });
  }

  return focus;
}

function buildClaimReason(claim: ClaimResult): string {
  if (claim.reason_code) {
    return humanizeReasonCode(claim.reason_code, claim.evidence);
  }
  // Generic fallback: first non-empty note from evidence
  for (const ev of claim.evidence) {
    if (ev.note) return ev.note;
  }
  return `claim ${claim.claim_id} ${claim.verdict}`;
}

function humanizeReasonCode(code: string, evidence: ClaimResult["evidence"]): string {
  switch (code) {
    case "detector_not_implemented":
      return "no detector registered for this behavioral property";
    case "unsupported_check":
      // Find the first non-empty note in evidence
      for (const ev of evidence) {
        if (ev.note) return ev.note;
      }
      return "check not supported for this target";
    default:
      // Detector-specific codes: scan evidence for first non-empty note
      for (const ev of evidence) {
        if (ev.note) return ev.note;
      }
      return code;
  }
}

function buildUndeclaredReason(item: UndeclaredFinding): string {
  if (item.type === "file") {
    return `file ${item.path} changed but not covered by any claim`;
  }
  return `symbol ${item.symbol ?? "(unknown)"} in ${item.path} not covered by any claim`;
}

/**
 * Assembles the final VerdictReport.
 */
export function buildVerdictReport(
  manifestHash: string,
  claims: ClaimResult[],
  undeclared: UndeclaredFinding[],
): VerdictReport {
  const verdicts = claims.map((c) => c.verdict);
  const summary = {
    total_claims: claims.length,
    verified: verdicts.filter((v) => v === "verified").length,
    unverified: verdicts.filter((v) => v === "unverified").length,
    partial: verdicts.filter((v) => v === "partial").length,
    unverifiable: verdicts.filter((v) => v === "unverifiable").length,
    undeclared_files: undeclared.filter((u) => u.type === "file").length,
    undeclared_symbols: undeclared.filter((u) => u.type === "symbol").length,
  };

  const reviewer_focus = buildReviewerFocus(claims, undeclared);

  return {
    manifest_hash: manifestHash,
    summary,
    claims,
    undeclared,
    reviewer_focus,
  };
}
