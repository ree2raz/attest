import { SyntaxKind, type SourceFile } from "ts-morph";
import type { VerificationContract } from "@attest/schema";
import type { ClaimResult } from "../types.js";

const TEST_CALL_NAMES = new Set(["describe", "it", "test", "suite", "context"]);

/**
 * Verifies that a test file references the subject_symbol by scanning:
 *  1. Import declarations (named/default/namespace)
 *  2. String literals in describe/it/test/suite calls
 *  3. new-expressions and call-expressions referencing the symbol by name
 */
export function checkTestCovers(
  claim_id: string,
  path: string,
  vc: VerificationContract,
  sourceFile: SourceFile,
): ClaimResult {
  const subjectSymbol = vc.params?.["subject_symbol"];

  if (typeof subjectSymbol !== "string" || !subjectSymbol) {
    return {
      claim_id,
      verdict: "unverifiable",
      reason_code: "unsupported_check",
      evidence: [{ kind: "test", path, note: "params.subject_symbol is required for test_covers" }],
    };
  }

  let refCount = 0;

  // 1. Import declarations
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport?.getText() === subjectSymbol) { refCount++; break; }

    const namespaceImport = importDecl.getNamespaceImport();
    if (namespaceImport?.getText() === subjectSymbol) { refCount++; break; }

    const named = importDecl.getNamedImports().find((n) => n.getName() === subjectSymbol);
    if (named) { refCount++; break; }
  }

  // 2. String literals inside test-runner calls
  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const calleeName = callExpr.getExpression().getText().split(".").pop() ?? "";
    if (!TEST_CALL_NAMES.has(calleeName)) continue;

    for (const arg of callExpr.getArguments()) {
      if (arg.getKind() === SyntaxKind.StringLiteral) {
        const text = arg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
        if (text.includes(subjectSymbol)) { refCount++; break; }
      }
    }
  }

  // 3. Identifier references at call-sites and new-expressions
  for (const id of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() === subjectSymbol) {
      const parent = id.getParent();
      if (
        parent?.getKind() === SyntaxKind.NewExpression ||
        parent?.getKind() === SyntaxKind.CallExpression
      ) {
        refCount++;
      }
    }
  }

  if (refCount > 0) {
    return {
      claim_id,
      verdict: "verified",
      evidence: [{ kind: "test", path, symbol: subjectSymbol, note: `${refCount} reference(s) found` }],
    };
  }

  return {
    claim_id,
    verdict: "unverified",
    evidence: [{ kind: "test", path, symbol: subjectSymbol, note: "no references to subject_symbol found" }],
  };
}
