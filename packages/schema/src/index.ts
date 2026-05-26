// @attest/schema — public API
export { SCHEMA_VERSION } from "./types.js";
export type {
  SchemaVersion,
  AgentId,
  TaskSource,
  ClaimType,
  CheckKind,
  BehavioralProperty,
  TargetKind,
  Target,
  VerificationContract,
  Claim,
  Session,
  Task,
  Manifest,
} from "./types.js";
export { createValidator } from "./validator.js";
export type { Validator, ValidationError } from "./validator.js";
