import { ATTEST_VERSION } from "@attest/schema";
import type { ClaimResult, UndeclaredChange, Verdict, VerdictSummary } from "@attest/schema";
import { verifyClaim } from "./claims.js";
import { Sources } from "./sources.js";
import { detectUndeclared } from "./undeclared.js";
import type { VerifyInput } from "./types.js";

/**
 * Run the three verifier families and assemble the verdict (SPEC §6). The JSON
 * verdict is the source of truth; exit code policy (§6.6):
 *
 *   exit 0 iff every claim is `verified` or `unverifiable` AND there are zero
 *   flagged (non-suppressed) undeclared changes; otherwise exit 1.
 *
 * `unverifiable` never fails the build — that is the Camp-3 guard.
 */
export async function verify(input: VerifyInput): Promise<Verdict> {
  const { manifest, diff, repoRoot, config, outcomes } = input;
  const sources = new Sources(repoRoot, diff);

  const claimResults: ClaimResult[] = [];
  for (const claim of manifest.claims) {
    claimResults.push(await verifyClaim(claim, { diff, sources, config, outcomes }));
  }

  const undeclared = await detectUndeclared(manifest, diff, sources, config);
  const summary = summarize(claimResults, undeclared);

  const failedClaims = summary.failed > 0;
  const flaggedUndeclared = summary.undeclared > 0;
  const exitCode: 0 | 1 = failedClaims || flaggedUndeclared ? 1 : 0;

  return {
    attest_version: ATTEST_VERSION,
    task_id: manifest.task.id,
    result: exitCode === 0 ? "pass" : "fail",
    exit_code: exitCode,
    claims: claimResults,
    undeclared_changes: undeclared,
    summary,
  };
}

function summarize(claims: ClaimResult[], undeclared: UndeclaredChange[]): VerdictSummary {
  let verified = 0;
  let failed = 0;
  let unverifiable = 0;
  for (const claim of claims) {
    if (claim.status === "verified") verified++;
    else if (claim.status === "failed") failed++;
    else unverifiable++;
  }
  // Only flagged (non-suppressed) undeclared changes count toward the gate.
  const flagged = undeclared.filter((u) => u.severity === "flag").length;

  return {
    claims_total: claims.length,
    verified,
    failed,
    unverifiable,
    undeclared: flagged,
  };
}
