import type { ClaimResult, OutcomeCheck, OutcomeClaim } from "@attest/schema";
import type { OutcomeResults } from "../types.js";
import { failed, unverifiable, verified } from "./result.js";

/**
 * `outcome` (SPEC §6.4): compare the injected runner result for the claimed check.
 * Core never executes commands — `@attest/runner` runs them under isolation and
 * injects the results, keeping the verification path pure.
 */
export function verifyOutcome(claim: OutcomeClaim, outcomes?: OutcomeResults): ClaimResult {
  const result = outcomes?.[claim.check];
  if (!result) {
    return unverifiable(
      claim.id,
      `outcome check '${claim.check}' was not executed (no runner result available)`,
    );
  }

  const evidence: Record<string, unknown> = { check: claim.check };
  if (result.cmd !== undefined) evidence["cmd"] = result.cmd;
  if (result.exitCode !== undefined) evidence["exit_code"] = result.exitCode;

  if (result.passed) {
    if (result.durationMs !== undefined) evidence["duration_ms"] = result.durationMs;
    return verified(claim.id, evidence);
  }
  return failed(claim.id, outcomeFailReason(claim.check), evidence);
}

function outcomeFailReason(check: OutcomeCheck): string {
  const command = check === "tests_pass" ? "test" : check === "build_passes" ? "build" : "lint";
  return `${command} command exited non-zero (${check} not satisfied)`;
}
