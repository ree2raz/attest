// Re-export the canonical Detector interfaces from @attest/core.
// @attest/detectors-ts only provides implementations; the contracts live in core
// to avoid circular dependencies (verifier needs to call detectors at runtime).
export type { Detector, DetectorContext, DetectorVerdict } from "@attest/core";

import type { Detector } from "@attest/core";

/** Returns all registered detectors. Populated in subsequent commits. */
export function registerDetectors(): Detector[] {
  return [];
}
