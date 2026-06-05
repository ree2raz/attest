// @attest/detectors-ts — demoted, opt-in, best-effort plugin (SPEC §6.5).
//
// This package is OFF by default. It has no path into the verdict: nothing
// in `@attest/core` or `@attest/cli` calls it. Use it for an extra human
// signal at review time, not for CI gating. Every `DetectorOutput` carries
// `warnings` to make the advisory nature visible.

export { runDetectors, findRoutesInFile } from "./run-detectors.js";
export { detectAuthentication } from "./authentication/index.js";
export { DETECTOR_WARNINGS } from "./types.js";
export type {
  AuthenticationInput,
  DetectorInput,
  DetectorOutput,
  DetectorStatus,
} from "./types.js";
