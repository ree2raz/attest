import { findFile, hunkCount } from "@attest/diff";
import type { ParsedDiff } from "@attest/diff";
import type { ClaimResult, FileChangeClaim } from "@attest/schema";
import { failed, verified } from "./result.js";

/**
 * `file_change` (SPEC §6.2): confirm the diff contains a change to `path` with the
 * claimed `op`. Pure diff operation, language-agnostic.
 */
export function verifyFileChange(claim: FileChangeClaim, diff: ParsedDiff): ClaimResult {
  const file = findFile(diff, claim.path);
  if (!file) return failed(claim.id, `no change detected for ${claim.path}`);
  if (file.op !== claim.op) {
    return failed(claim.id, `expected ${claim.op} of ${claim.path} but the diff shows ${file.op}`, {
      op: file.op,
    });
  }
  return verified(claim.id, { op: file.op, hunks: hunkCount(file) });
}
