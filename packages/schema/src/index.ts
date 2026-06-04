// @attest/schema — public API

export { ATTEST_VERSION, KNOWN_CLAIM_KINDS, isKnownClaim } from "./types.js";

export type {
  AttestVersion,
  // Manifest (§4.1)
  FileOp,
  SymbolKind,
  OutcomeCheck,
  Task,
  Agent,
  DeclaredScope,
  FileChangeClaim,
  SymbolAddedClaim,
  SymbolRemovedClaim,
  SymbolModifiedClaim,
  TestAddedClaim,
  TestModifiedClaim,
  OutcomeClaim,
  KnownClaim,
  KnownClaimKind,
  UnknownClaim,
  Claim,
  Manifest,
  // Verdict (§4.2)
  ClaimStatus,
  VerdictResult,
  UndeclaredGranularity,
  UndeclaredSeverity,
  ClaimResult,
  UndeclaredChange,
  VerdictSummary,
  Verdict,
  // Audit (§4.3, provisional)
  AuditDisposition,
  AuditGoverningSpec,
  AuditRecord,
} from "./types.js";

export {
  createManifestValidator,
  createVerdictValidator,
  MANIFEST_SCHEMA,
  VERDICT_SCHEMA,
  AUDIT_SCHEMA,
} from "./validator.js";

export type { Validator, ValidationError, ValidationResult } from "./validator.js";
