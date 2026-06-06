import { Project, type SourceFile } from "ts-morph";
import {
  DETECTOR_WARNINGS,
  type AuthenticationInput,
  type DetectorOutput,
  type DetectorStatus,
} from "../types.js";
import { collectChain, type ChainEntry } from "./chain.js";
import { detectFramework } from "./framework.js";

/**
 * Run the (best-effort) authentication heuristic on a single
 * `(path, symbol, content)` triple. Returns an *advisory* annotation —
 * **never a verdict**. See SPEC §6.5 and `../types.ts` for the
 * advisory/verdict boundary.
 *
 * Status mapping (preserved from the v0.1 detector for compatibility):
 *
 *   has auth in chain       → `advisory_present`
 *   chain is empty/not-auth → `advisory_absent`
 *   chain has "unknown"     → `advisory_inconclusive`
 *   route missing / parse   → `advisory_inconclusive`
 *
 * `reason_code` matches the v0.1 vocabulary so the same fixtures (and any
 * downstream tooling that read them) keep working.
 */
export async function detectAuthentication(input: AuthenticationInput): Promise<DetectorOutput> {
  const { path, symbol, content } = input;

  const framework = detectFramework(content);
  if (!framework) {
    return {
      detector: "authentication",
      path,
      symbol,
      framework: "unknown",
      status: "advisory_inconclusive",
      reason_code: "framework_unsupported",
      note: "no recognized framework import found in file",
      evidence: [],
      warnings: DETECTOR_WARNINGS,
    };
  }

  let sourceFile: SourceFile;
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
    });
    sourceFile = project.createSourceFile(path, content);
  } catch (err) {
    return {
      detector: "authentication",
      path,
      symbol,
      framework,
      status: "advisory_inconclusive",
      reason_code: "parse_error",
      note: `parse error: ${String(err)}`,
      evidence: [],
      warnings: DETECTOR_WARNINGS,
    };
  }

  const chain = collectChain(sourceFile, framework, symbol);
  return chainToOutput(path, symbol, framework, chain);
}

function chainToOutput(
  path: string,
  symbol: string,
  framework: string,
  chain: ChainEntry[] | "not_found",
): DetectorOutput {
  if (chain === "not_found") {
    return {
      detector: "authentication",
      path,
      symbol,
      framework,
      status: "advisory_absent",
      reason_code: "no_route_found",
      note: `route ${symbol} not found in file`,
      evidence: [{ kind: "route", symbol }],
      warnings: DETECTOR_WARNINGS,
    };
  }

  const hasAuth = chain.some((e) => e.classification === "auth");
  const hasUnknown = chain.some((e) => e.classification === "unknown");
  const allNotAuth = chain.length > 0 && chain.every((e) => e.classification === "not-auth");

  let status: DetectorStatus;
  let reason_code: string | undefined;
  if (hasAuth) {
    status = "advisory_present";
  } else if (hasUnknown) {
    status = "advisory_inconclusive";
    reason_code = "unknown_middleware_only";
  } else if (allNotAuth || chain.length === 0) {
    status = "advisory_absent";
    reason_code = "no_auth_in_chain";
  } else {
    status = "advisory_absent";
    reason_code = "no_auth_in_chain";
  }

  const evidence: DetectorOutput["evidence"] = [
    { kind: "route", symbol },
    ...chain.map((e) => ({
      kind: "middleware" as const,
      symbol: e.name,
      note: `classified ${e.classification} via ${e.layer}`,
    })),
  ];

  return {
    detector: "authentication",
    path,
    symbol,
    framework,
    status,
    ...(reason_code ? { reason_code } : {}),
    note: summaryNote(status, chain),
    evidence,
    warnings: DETECTOR_WARNINGS,
  };
}

function summaryNote(status: DetectorStatus, chain: ChainEntry[]): string {
  const names = chain.map((e) => e.name).join(", ");
  switch (status) {
    case "advisory_present":
      return `auth signal found via ${names || "route"}`;
    case "advisory_absent":
      return chain.length === 0 ? "no middleware in chain" : `no auth signal in chain (${names})`;
    case "advisory_inconclusive":
      return `unresolved middleware in chain (${names})`;
  }
}
