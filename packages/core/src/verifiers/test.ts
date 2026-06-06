import { addedLines, findFile } from "@attest/diff";
import type { ParsedDiff } from "@attest/diff";
import type { ClaimResult, TestAddedClaim, TestModifiedClaim } from "@attest/schema";
import { isTestFile } from "../config.js";
import type { AttestConfig } from "../types.js";
import { failed, unverifiable, verified } from "./result.js";

type TestClaim = TestAddedClaim | TestModifiedClaim;

/**
 * `test_added|modified` (SPEC §6.2) — structural only:
 *  1. a diff hunk exists for `path` and the repo classifies it as a test file;
 *  2. if `covers` is given, that identifier is referenced in the added test lines.
 *
 * `covers` is a structural reference check, NOT a coverage proof. If it cannot be
 * confirmed structurally, the result is `unverifiable` — never a guess.
 */
export function verifyTest(claim: TestClaim, diff: ParsedDiff, config?: AttestConfig): ClaimResult {
  const file = findFile(diff, claim.path);
  if (!file) return failed(claim.id, `no change detected for ${claim.path}`);

  if (!isTestFile(claim.path, config)) {
    return unverifiable(
      claim.id,
      `path ${claim.path} is not recognized as a test file; cannot structurally verify it as a test`,
    );
  }

  if (claim.covers === undefined) return verified(claim.id, { path: claim.path });

  const addedText = addedLines(file)
    .map((line) => line.content)
    .join("\n");
  if (referencesIdentifier(addedText, claim.covers)) {
    return verified(claim.id, { path: claim.path, covers: claim.covers });
  }
  return unverifiable(
    claim.id,
    `could not structurally confirm that ${claim.path} references '${claim.covers}'; route to review`,
  );
}

function referencesIdentifier(text: string, name: string): boolean {
  // Whole-identifier match: `name` not surrounded by identifier characters. This is
  // a structural token check, not a parse — sufficient and deterministic for the
  // "is this symbol referenced in the added test?" question.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(text);
}
