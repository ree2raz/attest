import { type SourceFile } from "ts-morph";
import type { Target, VerificationContract } from "@attest/schema";
import type { ClaimResult } from "../types.js";

function normalizeSignature(sig: string): string {
  return sig.replace(/\s+/g, " ").trim();
}

function extractSignature(sourceFile: SourceFile, symbol: string, kind: string): string | null {
  if (kind === "function") {
    const fn = sourceFile.getFunction(symbol);
    if (!fn) return null;
    const params = fn
      .getParameters()
      .map((p) => p.getText())
      .join(", ");
    const returnType = fn.getReturnTypeNode()?.getText() ?? "";
    return returnType ? `(${params}): ${returnType}` : `(${params})`;
  }

  if (kind === "class") {
    const cls = sourceFile.getClass(symbol);
    if (!cls) return null;
    const ctor = cls.getConstructors()[0];
    if (!ctor) return "()";
    const params = ctor
      .getParameters()
      .map((p) => p.getText())
      .join(", ");
    return `(${params})`;
  }

  if (kind === "type") {
    const ta = sourceFile.getTypeAlias(symbol);
    if (ta) return ta.getTypeNode()?.getText() ?? null;
    const iface = sourceFile.getInterface(symbol);
    if (iface) return iface.getText();
  }

  return null;
}

export function checkSignatureMatches(
  claim_id: string,
  target: Target,
  vc: VerificationContract,
  sourceFile: SourceFile,
): ClaimResult {
  const { kind, path, symbol } = target;

  if (!symbol) {
    return {
      claim_id,
      verdict: "unverifiable",
      reason_code: "unsupported_check",
      evidence: [{ kind: "symbol", path, note: "symbol required for signature_matches" }],
    };
  }

  if (kind !== "function" && kind !== "class" && kind !== "type") {
    return {
      claim_id,
      verdict: "unverifiable",
      reason_code: "unsupported_check",
      evidence: [
        {
          kind: "symbol",
          path,
          symbol,
          note: `signature_matches not supported for kind "${kind}"`,
        },
      ],
    };
  }

  const expected = vc.params?.["expected"];
  if (typeof expected !== "string") {
    return {
      claim_id,
      verdict: "unverifiable",
      reason_code: "unsupported_check",
      evidence: [{ kind: "symbol", path, symbol, note: "params.expected (string) required" }],
    };
  }

  const found = extractSignature(sourceFile, symbol, kind);
  if (!found) {
    return {
      claim_id,
      verdict: "unverified",
      evidence: [{ kind: "symbol", path, symbol, note: `${kind} declaration not found` }],
    };
  }

  const normalizedFound = normalizeSignature(found);
  const normalizedExpected = normalizeSignature(expected);

  if (normalizedFound === normalizedExpected) {
    return {
      claim_id,
      verdict: "verified",
      evidence: [{ kind: "symbol", path, symbol, note: "signature matches" }],
    };
  }

  return {
    claim_id,
    verdict: "unverified",
    evidence: [
      {
        kind: "symbol",
        path,
        symbol,
        note: `expected: ${normalizedExpected} — found: ${normalizedFound}`,
      },
    ],
  };
}
