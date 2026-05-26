// @attest/schema — stub exports (full implementation in subsequent commits)
export const SCHEMA_VERSION = "0.1" as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

// Type stubs so downstream packages compile before full implementation lands
export type AgentId = "claude-code" | "codex" | "cursor" | "opencode" | "other";
export type TaskSource = "user_prompt" | "issue_reference" | "continuation";
export type ClaimType =
  | "add_symbol"
  | "remove_symbol"
  | "modify_signature"
  | "modify_behavior"
  | "add_test"
  | "refactor"
  | "add_dependency"
  | "remove_dependency"
  | "config_change";
export type CheckKind =
  | "symbol_exists"
  | "behavior_present"
  | "test_covers"
  | "signature_matches"
  | "removed"
  | "cannot_verify";
export type BehavioralProperty =
  | "null_check"
  | "input_validation"
  | "error_handling"
  | "authentication"
  | "authorization"
  | "rate_limiting"
  | "logging"
  | "sanitization"
  | "timeout"
  | "retry_logic"
  | "cannot_express";
export type TargetKind =
  | "function"
  | "class"
  | "type"
  | "endpoint"
  | "file"
  | "module"
  | "config_key"
  | "package";

export interface Target {
  kind: TargetKind;
  path: string;
  symbol?: string;
}
export interface VerificationContract {
  check: CheckKind;
  params?: Record<string, unknown>;
}
export interface Claim {
  id: string;
  type: ClaimType;
  target: Target;
  description: string;
  verification_contract: VerificationContract;
}
export interface Session {
  agent: AgentId;
  model: string;
  session_id: string;
  started_at: string;
  completed_at: string;
  prompt_hash: string;
  tool_calls_count: number;
  files_touched: string[];
}
export interface Task {
  summary: string;
  source: TaskSource;
}
export interface Manifest {
  schema_version: SchemaVersion;
  session: Session;
  task: Task;
  claims: Claim[];
}

export interface ValidationError {
  path: string;
  code: string;
  message: string;
}
export interface Validator {
  validate(input: unknown): { ok: true; manifest: Manifest } | { ok: false; errors: ValidationError[] };
}
export function createValidator(): Validator {
  throw new Error("createValidator: not yet implemented");
}
