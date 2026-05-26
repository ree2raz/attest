import type { ClaimResult } from "../types.js";

/** No-op check: always returns unverifiable with no evidence. */
export function checkCannotVerify(claim_id: string): ClaimResult {
  return { claim_id, verdict: "unverifiable", evidence: [] };
}
