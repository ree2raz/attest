import { diffSymbols } from "@attest/symbols";
import { isKnownClaim } from "@attest/schema";
import type { Claim, Manifest, UndeclaredChange } from "@attest/schema";
import type { ParsedDiff } from "@attest/diff";
import { isAllowlisted, isTestFile } from "./config.js";
import type { Sources } from "./sources.js";
import type { AttestConfig } from "./types.js";

/**
 * Undeclared-change detection — the moat (SPEC §6.3).
 *
 * Walks the diff in order so the output mirrors the diff's file order. For each
 * changed file:
 *  - declared file  → emit intra-file symbol drift (added/modified symbols not
 *                     named by a claim for that path);
 *  - undeclared file → emit one file-level entry (suppressed if allowlisted).
 *
 * `declared = declared_scope.files ∪ { every claim's path }`.
 */
export async function detectUndeclared(
  manifest: Manifest,
  diff: ParsedDiff,
  sources: Sources,
  config?: AttestConfig,
): Promise<UndeclaredChange[]> {
  const declaredFiles = collectDeclaredFiles(manifest);
  const claimedSymbolsByPath = collectClaimedSymbols(manifest.claims);

  const out: UndeclaredChange[] = [];

  for (const file of diff.files) {
    if (declaredFiles.has(file.path)) {
      // A declared test file's added test functions are expected, not scope drift —
      // skip intra-file drift for it (its file-level change is already declared).
      if (isTestFile(file.path, config)) continue;

      // Intra-file symbol drift for an otherwise-declared file.
      const base = await sources.baseSymbols(file.path);
      const post = await sources.postSymbols(file.path);
      const delta = diffSymbols(base, post);
      const claimed = claimedSymbolsByPath.get(file.path) ?? new Set<string>();

      for (const decl of [...delta.added, ...delta.modified]) {
        if (claimed.has(decl.name)) continue;
        out.push({
          path: file.path,
          op: file.op,
          granularity: "symbol",
          severity: "flag",
          symbol: decl.name,
          symbol_kind: decl.kind,
        });
      }
    } else {
      out.push({
        path: file.path,
        op: file.op,
        granularity: "file",
        severity: isAllowlisted(file.path, config) ? "suppressed" : "flag",
      });
    }
  }

  return out;
}

function collectDeclaredFiles(manifest: Manifest): Set<string> {
  const files = new Set<string>(manifest.declared_scope.files);
  for (const claim of manifest.claims) {
    const path = claimPath(claim);
    if (path) files.add(path);
  }
  return files;
}

function collectClaimedSymbols(claims: Claim[]): Map<string, Set<string>> {
  const byPath = new Map<string, Set<string>>();
  for (const claim of claims) {
    if (!isKnownClaim(claim)) continue;
    if (
      claim.kind !== "symbol_added" &&
      claim.kind !== "symbol_removed" &&
      claim.kind !== "symbol_modified"
    ) {
      continue;
    }
    const set = byPath.get(claim.path) ?? new Set<string>();
    set.add(claim.symbol);
    byPath.set(claim.path, set);
  }
  return byPath;
}

/** The path a claim references, if any (`outcome` claims have none). */
function claimPath(claim: Claim): string | null {
  return "path" in claim && typeof claim.path === "string" ? claim.path : null;
}
