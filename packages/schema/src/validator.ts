import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import MANIFEST_SCHEMA_RAW from "./manifest.schema.json" with { type: "json" };
import VERDICT_SCHEMA_RAW from "./verdict.schema.json" with { type: "json" };
import AUDIT_SCHEMA_RAW from "./audit.schema.json" with { type: "json" };
import type { Manifest, Verdict } from "./types.js";
import { ATTEST_VERSION } from "./types.js";

/** Manifest JSON Schema (SPEC §4.1). */
export const MANIFEST_SCHEMA: AnySchema = MANIFEST_SCHEMA_RAW;
/** Verdict JSON Schema (SPEC §4.2). */
export const VERDICT_SCHEMA: AnySchema = VERDICT_SCHEMA_RAW;
/** Audit record JSON Schema (SPEC §4.3, provisional). */
export const AUDIT_SCHEMA: AnySchema = AUDIT_SCHEMA_RAW;

export interface ValidationError {
  path: string;
  code: string;
  message: string;
  /** ajv's keyword params (e.g. `allowedValues`, `missingProperty`, `additionalProperty`). */
  params?: Record<string, unknown>;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] };

export interface Validator<T> {
  validate(input: unknown): ValidationResult<T>;
}

function ajvErrorToValidationError(err: ErrorObject): ValidationError {
  return {
    path: err.instancePath || "/",
    code: err.keyword,
    message: err.message ?? "validation failed",
    params: (err.params ?? {}) as Record<string, unknown>,
  };
}

/**
 * Compiles a schema once and returns a validator that reports structured errors.
 * Validation is purely structural — there is no semantic layer. (The v0.1
 * `behavior_present` params check is deliberately gone with the semantic model.)
 */
function makeValidator<T>(schema: AnySchema): Validator<T> {
  let compiled: ValidateFunction | null = null;

  function getCompiled(): ValidateFunction {
    if (!compiled) {
      const ajv = new Ajv({ allErrors: true });
      addFormats(ajv);
      compiled = ajv.compile(schema);
    }
    return compiled;
  }

  return {
    validate(input: unknown): ValidationResult<T> {
      const validate = getCompiled();
      if (validate(input)) {
        return { ok: true, value: input as T };
      }
      const errors = (validate.errors ?? []).map(ajvErrorToValidationError);
      return { ok: false, errors };
    },
  };
}

/** Validates an agent-emitted manifest against the v1.0 schema (SPEC §4.1). */
export function createManifestValidator(): Validator<Manifest> {
  return makeValidator<Manifest>(MANIFEST_SCHEMA);
}

/** Validates a verdict against the v1.0 schema (SPEC §4.2). */
export function createVerdictValidator(): Validator<Verdict> {
  return makeValidator<Verdict>(VERDICT_SCHEMA);
}

/**
 * Renders a structured validation error as a single legible line:
 *   "path/to/field: <problem> — <fix>"
 * The format is intended for CLI stderr and CI logs (one error per line,
 * path-pointed, no JSON dump). Use this in preference to raw ajv messages.
 *
 * The function is aware of the closed claim taxonomy and the v1.0 enum sets
 * so common drift failures get a targeted fix message instead of a generic
 * "must be equal to one of the allowed values".
 */
export function formatValidationError(err: ValidationError): string {
  const path = err.path === "/" ? "(root)" : err.path.replace(/^\//, "");
  const params = err.params ?? {};

  // attest_version
  if (path === "attest_version" && err.code === "const") {
    // ajv's const keyword puts the expected value in `allowedValue`; the actual
    // value is on the instance, not in params, so we can't quote it here.
    return `${path}: must be exactly "${ATTEST_VERSION}" (the only supported manifest version)`;
  }
  if (path === "attest_version" && err.code === "type") {
    return `${path}: must be a string equal to "${ATTEST_VERSION}"`;
  }

  // task.description length
  if (path === "task/description" && err.code === "maxLength") {
    return `${path}: must be ≤ 280 characters (current task description is too long)`;
  }

  // generated_at format
  if (path === "generated_at") {
    return `${path}: must be an RFC 3339 date-time (e.g. "2026-06-06T12:00:00Z")`;
  }

  // claims array
  if (path === "claims" && err.code === "minItems") {
    return `${path}: at least one claim is required (an empty manifest is meaningless)`;
  }
  if (path === "claims" && err.code === "type") {
    return `${path}: must be an array of claim objects`;
  }

  // Claim id pattern
  if (path.endsWith("/id") && err.code === "pattern") {
    return `${path}: must match the pattern ^c[0-9]+$ (e.g. "c1", "c2", "c10") — claim ids are stable identifiers used by humans and CI logs`;
  }

  // Required field missing
  if (err.code === "required" && typeof params["missingProperty"] === "string") {
    return `${path}: missing required field "${params["missingProperty"]}"`;
  }

  // Enum failures: the schema uses if/then with const enums; the ajv "message"
  // is generic, but params.allowedValues carries the closed set.
  if (err.code === "enum" && Array.isArray(params["allowedValues"])) {
    const allowed = (params["allowedValues"] as string[]).map((v) => `"${v}"`).join(", ");
    if (path.endsWith("/op")) {
      return `${path}: must be one of ${allowed} (file_change claims need a known operation)`;
    }
    if (path.endsWith("/symbol_kind")) {
      return `${path}: must be one of ${allowed}`;
    }
    if (path.endsWith("/check")) {
      return `${path}: must be one of ${allowed} (outcome claims declare which check was run; build/tests/lint are the supported v1.0 set)`;
    }
    if (path.endsWith("/result")) {
      return `${path}: must be one of ${allowed} (verdict result is binary: pass or fail)`;
    }
    if (path.endsWith("/status")) {
      return `${path}: must be one of ${allowed} (claim status: verified, failed, or unverifiable)`;
    }
    if (path.endsWith("/granularity")) {
      return `${path}: must be one of ${allowed}`;
    }
    if (path.endsWith("/severity")) {
      return `${path}: must be one of ${allowed}`;
    }
    if (path.endsWith("/disposition")) {
      return `${path}: must be one of ${allowed}`;
    }
  }

  // Type failures
  if (err.code === "type") {
    return `${path}: ${err.message} (got wrong JSON type)`;
  }

  // additionalProperties on the manifest root
  if (err.code === "additionalProperties" && path === "(root)") {
    return `manifest: unknown top-level field "${params["additionalProperty"] ?? "?"}" — the v1.0 manifest has a closed top-level shape (attest_version, task, agent, generated_at, declared_scope, claims)`;
  }

  // Default: pass through with path prefix. We skip the redundant `if/then`
  // markers — ajv emits a "must match then schema" for every nested `if`
  // failure, which is noise on top of the more specific error above it.
  if (err.code === "if") return "";
  return `${path}: ${err.message}${err.code ? ` [${err.code}]` : ""}`;
}

/** Convenience: format a whole batch of errors as a list of one-line strings. */
export function formatValidationErrors(errors: ValidationError[]): string[] {
  return errors.map(formatValidationError).filter((line) => line.length > 0);
}
