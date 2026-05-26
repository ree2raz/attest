import { SyntaxKind, type SourceFile } from "ts-morph";
import type { Target } from "@attest/schema";
import type { ClaimResult } from "../types.js";
import { locateRoute } from "../locate-route.js";

function findTopLevelDeclaration(sourceFile: SourceFile, name: string): boolean {
  if (sourceFile.getFunction(name)) return true;
  if (sourceFile.getClass(name)) return true;
  if (sourceFile.getInterface(name)) return true;
  if (sourceFile.getTypeAlias(name)) return true;
  // Enum
  if (sourceFile.getEnum(name)) return true;
  // Module-level variable (const/let/var)
  for (const stmt of sourceFile.getVariableStatements()) {
    for (const decl of stmt.getDeclarations()) {
      if (decl.getName() === name) return true;
    }
  }
  // Namespace / module declaration
  for (const ns of sourceFile.getDescendantsOfKind(SyntaxKind.ModuleDeclaration)) {
    if (ns.getName() === name && ns.getParent() === sourceFile) return true;
  }
  return false;
}

/**
 * Checks whether the named symbol exists in the parsed source file.
 *
 * For endpoint targets, delegates to locateRoute().
 * For all others, uses syntactic top-level declaration lookup.
 */
export function checkSymbolExists(
  claim_id: string,
  target: Target,
  sourceFile: SourceFile,
): ClaimResult {
  const { kind, path, symbol } = target;

  if (kind === "file" || kind === "module") {
    // Existence is confirmed by the caller (file was found at repoRoot/path)
    return {
      claim_id,
      verdict: "verified",
      evidence: [{ kind: "symbol", path, note: "file exists" }],
    };
  }

  if (!symbol) {
    return {
      claim_id,
      verdict: "unverifiable",
      reason_code: "unsupported_check",
      evidence: [{ kind: "symbol", path, note: "symbol field required for this target kind" }],
    };
  }

  if (kind === "endpoint") {
    const location = locateRoute(sourceFile, symbol);
    if (!location) {
      return {
        claim_id,
        verdict: "unverified",
        evidence: [{ kind: "route", path, symbol, note: `route ${symbol} not found in file` }],
      };
    }
    // No-note route summary entry (first) so human renderer falls through to
    // Rule 3 (target fallback) rather than printing the framework detail note.
    return {
      claim_id,
      verdict: "verified",
      evidence: [{ kind: "route", path, symbol }],
    };
  }

  // function, class, type, package, config_key
  const found = findTopLevelDeclaration(sourceFile, symbol);
  if (found) {
    return {
      claim_id,
      verdict: "verified",
      evidence: [{ kind: "symbol", path, symbol, note: `${kind} declaration found` }],
    };
  }

  return {
    claim_id,
    verdict: "unverified",
    evidence: [{ kind: "symbol", path, symbol, note: `${kind} declaration not found in post-diff content` }],
  };
}
