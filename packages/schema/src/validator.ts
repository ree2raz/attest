import Ajv, { type AnySchema, type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Manifest, BehavioralProperty } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the JSON Schema at module initialisation time (sync; file is bundled alongside).
const rawSchema = JSON.parse(
  readFileSync(join(__dirname, "manifest.schema.json"), "utf-8"),
) as AnySchema;

/** Exhaustive list of valid behavioral_property values for semantic validation (Rule 3). */
const BEHAVIORAL_PROPERTIES: ReadonlySet<BehavioralProperty> = new Set<BehavioralProperty>([
  "null_check",
  "input_validation",
  "error_handling",
  "authentication",
  "authorization",
  "rate_limiting",
  "logging",
  "sanitization",
  "timeout",
  "retry_logic",
  "cannot_express",
]);

export interface ValidationError {
  path: string;
  code: string;
  message: string;
}

export interface Validator {
  validate(
    input: unknown,
  ): { ok: true; manifest: Manifest } | { ok: false; errors: ValidationError[] };
}

function ajvErrorToValidationError(err: ErrorObject): ValidationError {
  return {
    path: err.instancePath || "/",
    code: err.keyword,
    message: err.message ?? "validation failed",
  };
}

/** Factory so each call site gets a fresh validator with shared compiled schema. */
let compiledValidate: ReturnType<Ajv["compile"]> | null = null;

function getCompiledValidator(): ReturnType<Ajv["compile"]> {
  if (!compiledValidate) {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    compiledValidate = ajv.compile(rawSchema);
  }
  return compiledValidate;
}

/**
 * Semantic validation for hard-fail rule 3:
 * If check is "behavior_present", params.property must be in the BehavioralProperty enum.
 *
 * JSON Schema cannot enforce this because params is typed as a free `object`.
 */
function validateBehaviorPresentParams(input: unknown): ValidationError[] {
  if (typeof input !== "object" || input === null) return [];
  const obj = input as Record<string, unknown>;
  const claims = obj["claims"];
  if (!Array.isArray(claims)) return [];

  const errors: ValidationError[] = [];
  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i] as Record<string, unknown> | undefined;
    if (!claim) continue;
    const vc = claim["verification_contract"] as Record<string, unknown> | undefined;
    if (!vc || vc["check"] !== "behavior_present") continue;

    const params = vc["params"] as Record<string, unknown> | undefined;
    const property = params?.["property"];

    if (property === undefined) {
      errors.push({
        path: `/claims/${i}/verification_contract/params/property`,
        code: "required",
        message: "behavior_present check requires params.property",
      });
    } else if (
      typeof property !== "string" ||
      !BEHAVIORAL_PROPERTIES.has(property as BehavioralProperty)
    ) {
      errors.push({
        path: `/claims/${i}/verification_contract/params/property`,
        code: "enum",
        message: `params.property "${String(property)}" is not a valid behavioral_property`,
      });
    }
  }
  return errors;
}

export function createValidator(): Validator {
  const validate = getCompiledValidator();

  return {
    validate(input: unknown) {
      const schemaValid = validate(input);

      if (!schemaValid) {
        const errors: ValidationError[] = (validate.errors ?? []).map(ajvErrorToValidationError);
        return { ok: false, errors };
      }

      // Rule 3: semantic check for behavior_present params
      const semanticErrors = validateBehaviorPresentParams(input);
      if (semanticErrors.length > 0) {
        return { ok: false, errors: semanticErrors };
      }

      return { ok: true, manifest: input as Manifest };
    },
  };
}
