import type { SourceFile } from "ts-morph";
import type { Target } from "@attest/schema";
import type { ClaimResult } from "../types.js";
import { checkSymbolExists } from "./symbol-exists.js";

/**
 * Mirrors symbol-exists: returns verified if the symbol is ABSENT.
 * The caller passes null sourceFile when the file itself was deleted.
 */
export function checkRemoved(
  claim_id: string,
  target: Target,
  sourceFile: SourceFile | null,
): ClaimResult {
  const { kind, path, symbol } = target;

  // File-level: if sourceFile is null the file is gone — verified
  if (kind === "file" || kind === "module") {
    if (!sourceFile) {
      return {
        claim_id,
        verdict: "verified",
        evidence: [{ kind: "symbol", path, note: "file absent from post-diff state" }],
      };
    }
    return {
      claim_id,
      verdict: "unverified",
      evidence: [{ kind: "symbol", path, note: "file still present in post-diff state" }],
    };
  }

  if (!sourceFile) {
    // If the whole file is gone, the symbol is certainly gone too
    return {
      claim_id,
      verdict: "verified",
      evidence: [
        {
          kind: "symbol",
          path,
          ...(symbol ? { symbol } : {}),
          note: "file deleted; symbol implicitly removed",
        },
      ],
    };
  }

  // Delegate to symbol-exists and invert the verdict
  const existsResult = checkSymbolExists(claim_id, target, sourceFile);

  if (existsResult.verdict === "verified") {
    return {
      claim_id,
      verdict: "unverified",
      evidence: [
        {
          kind: "symbol",
          path,
          ...(symbol ? { symbol } : {}),
          note: `${target.kind} still present in post-diff content`,
        },
      ],
    };
  }

  if (existsResult.verdict === "unverified") {
    return {
      claim_id,
      verdict: "verified",
      evidence: [
        {
          kind: "symbol",
          path,
          ...(symbol ? { symbol } : {}),
          note: `${target.kind} absent from post-diff content`,
        },
      ],
    };
  }

  // unverifiable passthrough
  return existsResult;
}
