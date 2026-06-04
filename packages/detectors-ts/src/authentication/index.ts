import { Project } from "ts-morph";
import type { Claim } from "@attest/schema";
import type { DetectorContext, DetectorVerdict } from "@attest/core";
import type { KnownFramework } from "./types.js";
import { collectChain } from "./chain.js";

// ─── Framework detection ───────────────────────────────────────────────────

const FRAMEWORK_IMPORTS: Array<{ pattern: string | RegExp; framework: KnownFramework }> = [
  { pattern: "express", framework: "express" },
  { pattern: "fastify", framework: "fastify" },
  { pattern: "@nestjs/common", framework: "nestjs" },
  { pattern: "@nestjs/core", framework: "nestjs" },
  { pattern: "koa", framework: "koa" },
  { pattern: "@koa/router", framework: "koa" },
  { pattern: "http", framework: "rawnode" },
  { pattern: "https", framework: "rawnode" },
  { pattern: "node:http", framework: "rawnode" },
  { pattern: "node:https", framework: "rawnode" },
];

function detectFramework(content: string): KnownFramework | null {
  // Quick scan using regex to avoid full parse for this step
  for (const { pattern, framework } of FRAMEWORK_IMPORTS) {
    const escaped =
      typeof pattern === "string" ? pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : pattern.source;
    const re = new RegExp(`from\\s+["']${escaped}["']`);
    if (re.test(content)) return framework;
  }
  return null;
}

// ─── Verdict computation ───────────────────────────────────────────────────

function computeVerdictFromChain(
  chain: ReturnType<typeof collectChain>,
  path: string,
  symbol: string,
): DetectorVerdict {
  if (chain === "not_found") {
    return {
      verdict: "unverified",
      reason_code: "no_route_found",
      evidence: [
        { kind: "route", path, symbol },
        { kind: "symbol", path, symbol, note: `route ${symbol} not found in file` },
      ],
    };
  }

  // Route summary entry (no note — required by spec)
  const routeSummary = { kind: "route" as const, path, symbol };

  const chainEvidence = chain.map((entry) => ({
    kind: "middleware" as const,
    symbol: entry.name,
    note: `classified ${entry.classification} via ${entry.layer}`,
  }));

  const hasAuth = chain.some((e) => e.classification === "auth");
  const hasUnknown = chain.some((e) => e.classification === "unknown");
  const allNotAuth = chain.length > 0 && chain.every((e) => e.classification === "not-auth");

  if (hasAuth) {
    return {
      verdict: "verified",
      evidence: [routeSummary, ...chainEvidence],
    };
  }

  if (allNotAuth || chain.length === 0) {
    return {
      verdict: "unverified",
      reason_code: "no_auth_in_chain",
      evidence: [routeSummary, ...chainEvidence],
    };
  }

  if (hasUnknown) {
    return {
      verdict: "partial",
      reason_code: "unknown_middleware_only",
      evidence: [routeSummary, ...chainEvidence],
    };
  }

  // All not-auth (fallback)
  return {
    verdict: "unverified",
    reason_code: "no_auth_in_chain",
    evidence: [routeSummary, ...chainEvidence],
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function detectAuthentication(
  claim: Claim,
  ctx: DetectorContext,
): Promise<DetectorVerdict> {
  const { target, verification_contract: vc } = claim;

  // Validate claim shape
  if (target.kind !== "endpoint") {
    return {
      verdict: "unverifiable",
      reason_code: "invalid_claim_shape",
      evidence: [
        {
          kind: "symbol",
          path: target.path,
          note: `target.kind must be "endpoint", got "${target.kind}"`,
        },
      ],
    };
  }

  if (!target.symbol) {
    return {
      verdict: "unverifiable",
      reason_code: "invalid_claim_shape",
      evidence: [{ kind: "symbol", path: target.path, note: "target.symbol is required" }],
    };
  }

  if (vc.params?.["property"] !== "authentication") {
    return {
      verdict: "unverifiable",
      reason_code: "invalid_claim_shape",
      evidence: [
        {
          kind: "symbol",
          path: target.path,
          note: `params.property must be "authentication"`,
        },
      ],
    };
  }

  // Read file content
  const content = await ctx.postDiffFile(target.path);
  if (!content) {
    return {
      verdict: "unverifiable",
      reason_code: "parse_error",
      evidence: [{ kind: "symbol", path: target.path, note: "file not found" }],
    };
  }

  // Detect framework
  const framework = detectFramework(content);
  if (!framework) {
    return {
      verdict: "unverifiable",
      reason_code: "framework_unsupported",
      evidence: [
        {
          kind: "symbol",
          path: target.path,
          note: "no recognized framework import found in file",
        },
      ],
    };
  }

  // Parse with ts-morph (syntactic only, no TypeChecker)
  let sourceFile;
  try {
    const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
    sourceFile = project.createSourceFile(target.path, content);
  } catch (err) {
    return {
      verdict: "unverifiable",
      reason_code: "parse_error",
      evidence: [
        {
          kind: "symbol",
          path: target.path,
          note: `parse error: ${String(err)}`,
        },
      ],
    };
  }

  // Collect middleware/guard chain
  const chain = collectChain(sourceFile, framework, target.symbol);

  return computeVerdictFromChain(chain, target.path, target.symbol);
}
