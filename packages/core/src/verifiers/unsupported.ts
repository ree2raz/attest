import type { ClaimResult, UnknownClaim } from "@attest/schema";
import { unverifiable } from "./result.js";

/**
 * Any claim whose `kind` is outside the closed v1.0 taxonomy (SPEC §4.1) — notably
 * behavioral/semantic claims — is `unverifiable` with an LLM-review pointer. NEVER
 * a heuristic, NEVER a guess. This is the Camp-3 guard; it must never fail the build.
 */
export function verifyUnsupported(claim: UnknownClaim): ClaimResult {
  return unverifiable(
    claim.id,
    `claim kind '${claim.kind}' is semantic/behavioral and outside attest's structural taxonomy ` +
      `(unsupported_claim_kind); route to LLM/semantic review`,
  );
}
