import { createHash } from "node:crypto";
import type { Manifest } from "@attest/schema";
import type { ClaimResult, UndeclaredFinding, VerdictReport } from "./types.js";

/**
 * Computes SHA-256 of the raw manifest bytes and returns the hash prefixed with "sha256:".
 */
export function computeManifestHash(manifestRawBytes: Uint8Array): string {
  const hex = createHash("sha256").update(manifestRawBytes).digest("hex");
  return `sha256:${hex}`;
}

function humanize(code: string): string {
  return code.replace(/_/g, " ");
}

/**
 * Builds the reviewer_focus reason string for a single claim result.
 * Uses the spec §5.1 templates (applied verbatim in both JSON and human output).
 */
function buildClaimReason(claim: ClaimResult, manifest: Manifest): string {
  const mc = manifest.claims.find((c) => c.id === claim.claim_id);
  const vc = mc?.verification_contract;

  // behavior_present template
  if (vc?.check === "behavior_present") {
    const property = vc.params?.["property"] as string | undefined;
    const humanProp = property ? humanize(property) : "behavior";
    return `${claim.claim_id} failed — ${humanProp} not detected`;
  }

  // Other check with reason_code
  if (claim.reason_code) {
    return `${claim.claim_id} — ${humanize(claim.reason_code)}`;
  }

  // Other check without reason_code
  if (vc?.check) {
    return `${claim.claim_id} — ${humanize(vc.check)} failed`;
  }

  return `${claim.claim_id} — check failed`;
}

function buildUndeclaredReason(item: UndeclaredFinding): string {
  if (item.type === "symbol") {
    return `undeclared change to \`${item.symbol ?? item.path}\``;
  }
  return `undeclared file ${item.path}`;
}

/**
 * Builds the reviewer_focus array per the spec ordering:
 *   1. Unverified/partial claims (in claim-id order)
 *   2. Undeclared items (path+symbol lexicographic order)
 */
export function buildReviewerFocus(
  claims: ClaimResult[],
  undeclared: UndeclaredFinding[],
  manifest: Manifest,
): VerdictReport["reviewer_focus"] {
  const focus: VerdictReport["reviewer_focus"] = [];

  // 1. Unverified and partial claims, in claim-id order
  for (const claim of claims) {
    if (claim.verdict === "unverified" || claim.verdict === "partial") {
      const reason = buildClaimReason(claim, manifest);
      focus.push({ claim_id: claim.claim_id, reason });
    }
  }

  // 2. Undeclared items (already sorted by caller)
  for (const item of undeclared) {
    const reason = buildUndeclaredReason(item);
    focus.push({ undeclared: item, reason });
  }

  return focus;
}

/**
 * Assembles the final VerdictReport.
 */
export function buildVerdictReport(
  manifestHash: string,
  claims: ClaimResult[],
  undeclared: UndeclaredFinding[],
  manifest: Manifest,
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

  const reviewer_focus = buildReviewerFocus(claims, undeclared, manifest);

  return {
    manifest_hash: manifestHash,
    summary,
    claims,
    undeclared,
    reviewer_focus,
  };
}
