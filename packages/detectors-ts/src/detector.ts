// Re-export the canonical Detector interfaces from @attest/core.
export type { Detector, DetectorContext, DetectorVerdict } from "@attest/core";

import type { Detector } from "@attest/core";
import { detectAuthentication } from "./authentication/index.js";

const authenticationDetector: Detector = {
  id: "authentication",
  canHandle(claim) {
    return (
      claim.verification_contract.check === "behavior_present" &&
      claim.verification_contract.params?.["property"] === "authentication"
    );
  },
  run: detectAuthentication,
};

/** Returns all registered detectors. */
export function registerDetectors(): Detector[] {
  return [authenticationDetector];
}
