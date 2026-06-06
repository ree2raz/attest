/**
 * TypeScript types mirroring the v1.0 JSON Schemas (SPEC §4).
 * Single source of truth for the manifest, verdict, and audit shapes used across
 * every package. Schemas are versioned via `attest_version`.
 */

export const ATTEST_VERSION = "1.0" as const;
export type AttestVersion = typeof ATTEST_VERSION;

// ─────────────────────────────────────────────────────────────────────────────
// Manifest (input — emitted by the agent). SPEC §4.1.
// ─────────────────────────────────────────────────────────────────────────────

export type FileOp = "create" | "modify" | "delete";

/**
 * Language-agnostic declaration kind. @attest/symbols maps each of these to
 * concrete grammar node kinds per language via the node-kind maps.
 */
export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "type"
  | "struct"
  | "enum"
  | "constant"
  | "variable";

export type OutcomeCheck = "build_passes" | "tests_pass" | "lint_passes";

export interface Task {
  id: string;
  description: string;
}

export interface Agent {
  id: string;
  model?: string;
  tool_calls?: number;
}

export interface DeclaredScope {
  files: string[];
}

export interface FileChangeClaim {
  id: string;
  kind: "file_change";
  op: FileOp;
  path: string;
}

export interface SymbolAddedClaim {
  id: string;
  kind: "symbol_added";
  path: string;
  symbol: string;
  symbol_kind: SymbolKind;
}

export interface SymbolRemovedClaim {
  id: string;
  kind: "symbol_removed";
  path: string;
  symbol: string;
  symbol_kind: SymbolKind;
}

export interface SymbolModifiedClaim {
  id: string;
  kind: "symbol_modified";
  path: string;
  symbol: string;
  symbol_kind: SymbolKind;
}

export interface TestAddedClaim {
  id: string;
  kind: "test_added";
  path: string;
  covers?: string;
}

export interface TestModifiedClaim {
  id: string;
  kind: "test_modified";
  path: string;
  covers?: string;
}

export interface OutcomeClaim {
  id: string;
  kind: "outcome";
  check: OutcomeCheck;
}

/** The closed v1.0 claim taxonomy (SPEC §4.1). */
export type KnownClaim =
  | FileChangeClaim
  | SymbolAddedClaim
  | SymbolRemovedClaim
  | SymbolModifiedClaim
  | TestAddedClaim
  | TestModifiedClaim
  | OutcomeClaim;

export type KnownClaimKind = KnownClaim["kind"];

export const KNOWN_CLAIM_KINDS: readonly KnownClaimKind[] = [
  "file_change",
  "symbol_added",
  "symbol_removed",
  "symbol_modified",
  "test_added",
  "test_modified",
  "outcome",
];

/**
 * A claim whose `kind` is outside the closed taxonomy. The schema accepts it; the
 * verifier reports it as `unverifiable` with reason `unsupported_claim_kind`
 * (SPEC §4.1) — it is never rejected at validation time.
 */
export interface UnknownClaim {
  id: string;
  kind: string;
}

export type Claim = KnownClaim | UnknownClaim;

/** Narrows a claim to the closed taxonomy. */
export function isKnownClaim(claim: Claim): claim is KnownClaim {
  return (KNOWN_CLAIM_KINDS as readonly string[]).includes(claim.kind);
}

export interface Manifest {
  attest_version: AttestVersion;
  task: Task;
  agent: Agent;
  generated_at: string;
  declared_scope: DeclaredScope;
  claims: Claim[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict (output). SPEC §4.2.
// ─────────────────────────────────────────────────────────────────────────────

export type ClaimStatus = "verified" | "failed" | "unverifiable";
export type VerdictResult = "pass" | "fail";
export type UndeclaredGranularity = "file" | "symbol";
export type UndeclaredSeverity = "flag" | "suppressed";

export interface ClaimResult {
  id: string;
  status: ClaimStatus;
  /** Required for `failed` and `unverifiable`; an `unverifiable` reason carries the LLM-review pointer. */
  reason?: string;
  /** Heterogeneous, claim-kind-specific (e.g. `{ op, hunks }`, `{ node_kind, line }`, `{ cmd, exit_code }`). */
  evidence?: Record<string, unknown>;
}

export interface UndeclaredChange {
  path: string;
  op: FileOp;
  granularity: UndeclaredGranularity;
  severity: UndeclaredSeverity;
  symbol?: string;
  symbol_kind?: SymbolKind;
}

export interface VerdictSummary {
  claims_total: number;
  verified: number;
  failed: number;
  unverifiable: number;
  undeclared: number;
}

export interface Verdict {
  attest_version: AttestVersion;
  task_id: string;
  result: VerdictResult;
  exit_code: 0 | 1;
  claims: ClaimResult[];
  undeclared_changes: UndeclaredChange[];
  summary: VerdictSummary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit record (provenance). SPEC §4.3 — PROVISIONAL, finalized in Phase 3.
// ─────────────────────────────────────────────────────────────────────────────

export type AuditDisposition = "pending" | "accepted" | "rejected";

export interface AuditGoverningSpec {
  source: string;
  ref: string;
}

export interface AuditRecord {
  record_id: string;
  timestamp: string;
  invoking_user: string;
  governing_spec: AuditGoverningSpec | null;
  agent: { id: string; model?: string };
  input_context_hash: string;
  output_artifact_hash: string;
  verdict_digest: string;
  human_reviewer: string | null;
  disposition: AuditDisposition;
}
