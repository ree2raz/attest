// @attest/core — public API

export type {
  Verdict,
  CoreReasonCode,
  Evidence,
  ClaimResult,
  UndeclaredFinding,
  VerdictReport,
  DiffChange,
  DiffSet,
  VerifyInput,
} from "./types.js";

export type { Detector, DetectorContext, DetectorVerdict } from "./detector.js";

export { verify } from "./verifier.js";
export { parseDiffContent } from "./diff.js";
export { detectFramework, locateRoute } from "./locate-route.js";
export {
  computeUndeclaredFiles,
  extractTopLevelNames,
  computeUndeclaredSymbols,
  buildCoveredSymbolSet,
} from "./undeclared.js";
export { computeManifestHash, buildReviewerFocus, buildVerdictReport } from "./verdict.js";
