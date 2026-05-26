import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import { Project } from "ts-morph";
import type { Claim } from "@attest/schema";
import type { VerifyInput, VerdictReport, ClaimResult, UndeclaredFinding } from "./types.js";
import { computeManifestHash, buildVerdictReport } from "./verdict.js";
import { computeUndeclaredFiles, computeUndeclaredSymbols, buildCoveredSymbolSet } from "./undeclared.js";
import { checkCannotVerify } from "./checks/cannot-verify.js";
import { checkSymbolExists } from "./checks/symbol-exists.js";
import { checkRemoved } from "./checks/removed.js";
import { checkTestCovers } from "./checks/test-covers.js";
import { checkSignatureMatches } from "./checks/signature-matches.js";

/**
 * Hard-fail rule 5: all files_touched paths must remain inside repoRoot.
 */
function validateFilesTouched(repoRoot: string, filesTouched: readonly string[]): void {
  const normalizedRoot = resolve(repoRoot);
  for (const filePath of filesTouched) {
    const resolved = resolve(normalizedRoot, filePath);
    if (!resolved.startsWith(normalizedRoot + "/") && resolved !== normalizedRoot) {
      throw new Error(
        `files_touched path "${filePath}" is outside repo root "${normalizedRoot}"`,
      );
    }
  }
}

/**
 * Reads post-diff file content from disk. Returns null if the file does not exist.
 */
async function postDiffFile(repoRoot: string, filePath: string): Promise<string | null> {
  try {
    const fullPath = join(repoRoot, filePath);
    return await readFile(fullPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Dispatches a single claim to the appropriate check function.
 */
async function dispatchClaim(
  claim: Claim,
  repoRoot: string,
  project: Project,
  detectors: VerifyInput["detectors"],
): Promise<ClaimResult> {
  const { id: claim_id, target, verification_contract: vc } = claim;
  const check = vc.check;

  if (check === "cannot_verify") {
    return checkCannotVerify(claim_id);
  }

  if (check === "behavior_present") {
    // Find a detector that can handle this claim
    const detector = detectors.find((d) => d.canHandle(claim));
    if (!detector) {
      return {
        claim_id,
        verdict: "unverifiable",
        reason_code: "detector_not_implemented",
        evidence: [
          {
            kind: "symbol",
            path: target.path,
            ...(target.symbol ? { symbol: target.symbol } : {}),
            note: `no detector registered for check "behavior_present"`,
          },
        ],
      };
    }

    const ctx = {
      repoRoot,
      postDiffFile: (path: string) => postDiffFile(repoRoot, path),
    };
    const result = await detector.run(claim, ctx);
    return {
      claim_id,
      verdict: result.verdict,
      ...(result.reason_code ? { reason_code: result.reason_code } : {}),
      evidence: result.evidence,
    };
  }

  // For all other checks, we need the source file
  const content = await postDiffFile(repoRoot, target.path);
  const sourceFile =
    content !== null
      ? project.createSourceFile(`__virtual__/${target.path}`, content, { overwrite: true })
      : null;

  switch (check) {
    case "symbol_exists":
      if (!sourceFile) {
        return {
          claim_id,
          verdict: "unverified",
          evidence: [
            { kind: "symbol", path: target.path, note: "file not found in post-diff state" },
          ],
        };
      }
      return checkSymbolExists(claim_id, target, sourceFile);

    case "removed":
      return checkRemoved(claim_id, target, sourceFile);

    case "test_covers":
      if (!sourceFile) {
        return {
          claim_id,
          verdict: "unverified",
          evidence: [{ kind: "test", path: target.path, note: "file not found in post-diff state" }],
        };
      }
      return checkTestCovers(claim_id, target.path, vc, sourceFile);

    case "signature_matches":
      if (!sourceFile) {
        return {
          claim_id,
          verdict: "unverified",
          evidence: [
            { kind: "symbol", path: target.path, note: "file not found in post-diff state" },
          ],
        };
      }
      return checkSignatureMatches(claim_id, target, vc, sourceFile);

    default:
      return {
        claim_id,
        verdict: "unverifiable",
        reason_code: "unsupported_check",
        evidence: [
          {
            kind: "symbol",
            path: target.path,
            note: `check "${check}" is not supported`,
          },
        ],
      };
  }
}

/**
 * Main entry point for the attest verifier.
 *
 * Given a manifest, diff, and repo root, produces a VerdictReport with:
 *  - A SHA-256 manifest hash
 *  - Per-claim verdicts
 *  - Undeclared file/symbol findings
 *  - A reviewer_focus list ordered by priority
 */
export async function verify(input: VerifyInput): Promise<VerdictReport> {
  const { manifest, manifestRawBytes, diff, repoRoot, detectors } = input;
  const { session, claims } = manifest;

  // Rule 5: hard-fail on path traversal in files_touched
  validateFilesTouched(repoRoot, session.files_touched);

  // Compute manifest hash
  const manifestHash = computeManifestHash(manifestRawBytes);

  // Create a single ts-morph Project for all file parses in this run
  const project = new Project({ skipAddingFilesFromTsConfig: true, useInMemoryFileSystem: false });

  // Dispatch all claims concurrently
  const claimResults = await Promise.all(
    claims.map((claim) => dispatchClaim(claim, repoRoot, project, detectors)),
  );

  // Build declared file set from claims
  const declaredFiles = new Set(claims.map((c) => c.target.path));

  // Diff paths set
  const diffPaths = new Set(diff.changes.map((c) => c.path));

  // Undeclared file detection
  const undeclaredFilePaths = computeUndeclaredFiles(
    diffPaths,
    session.files_touched,
    declaredFiles,
  );
  const undeclaredFileFindings: UndeclaredFinding[] = undeclaredFilePaths.map((path) => ({
    type: "file",
    path,
  }));

  // Undeclared symbol detection: for each declared file, find symbols not covered by any claim
  const undeclaredSymbolFindings: UndeclaredFinding[] = [];
  const declaredFilesArray = [...declaredFiles];

  for (const filePath of declaredFilesArray) {
    const content = await postDiffFile(repoRoot, filePath);
    if (!content) continue;

    const sourceFile = project.createSourceFile(
      `__virtual_undeclared__/${filePath}`,
      content,
      { overwrite: true },
    );

    const coveredSymbols = buildCoveredSymbolSet(manifest, filePath);
    const symbolFindings = computeUndeclaredSymbols(sourceFile, filePath, coveredSymbols);
    undeclaredSymbolFindings.push(...symbolFindings);
  }

  // Sort undeclared symbols: path then symbol
  undeclaredSymbolFindings.sort((a, b) => {
    const pathCmp = a.path.localeCompare(b.path);
    if (pathCmp !== 0) return pathCmp;
    return (a.symbol ?? "").localeCompare(b.symbol ?? "");
  });

  const undeclared: UndeclaredFinding[] = [...undeclaredFileFindings, ...undeclaredSymbolFindings];

  return buildVerdictReport(manifestHash, claimResults, undeclared, manifest);
}
