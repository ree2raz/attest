import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Manifest, Verdict } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Loads a schema JSON that is bundled alongside this module in `dist/`. */
function loadSchema(name: string): AnySchema {
  return JSON.parse(readFileSync(join(__dirname, name), "utf-8")) as AnySchema;
}

export const MANIFEST_SCHEMA = loadSchema("manifest.schema.json");
export const VERDICT_SCHEMA = loadSchema("verdict.schema.json");
export const AUDIT_SCHEMA = loadSchema("audit.schema.json");

export interface ValidationError {
  path: string;
  code: string;
  message: string;
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
