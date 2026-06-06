import type { ClaimResult } from "@attest/schema";

/**
 * Constructors for {@link ClaimResult}. They build the object with exactly the
 * fields present (no `undefined` values) so it conforms to the verdict schema
 * under `exactOptionalPropertyTypes`.
 */

export function verified(id: string, evidence?: Record<string, unknown>): ClaimResult {
  return evidence ? { id, status: "verified", evidence } : { id, status: "verified" };
}

export function failed(
  id: string,
  reason: string,
  evidence?: Record<string, unknown>,
): ClaimResult {
  return evidence ? { id, status: "failed", reason, evidence } : { id, status: "failed", reason };
}

export function unverifiable(
  id: string,
  reason: string,
  evidence?: Record<string, unknown>,
): ClaimResult {
  return evidence
    ? { id, status: "unverifiable", reason, evidence }
    : { id, status: "unverifiable", reason };
}
