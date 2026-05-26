import { SyntaxKind, type SourceFile } from "ts-morph";
import type { UndeclaredFinding } from "./types.js";
import type { Manifest } from "@attest/schema";

/**
 * Computes file-level undeclared changes.
 *
 * undeclared_files = (diff_paths ∪ files_touched) − declared_files
 *
 * Using the union closes the omission vector: a file in the diff but absent
 * from files_touched is still surfaced.
 */
export function computeUndeclaredFiles(
  diffPaths: ReadonlySet<string>,
  filesTouched: readonly string[],
  declaredFiles: ReadonlySet<string>,
): string[] {
  const union = new Set([...diffPaths, ...filesTouched]);
  return [...union].filter((p) => !declaredFiles.has(p)).sort();
}

/**
 * Extracts all top-level declaration names from a SourceFile (syntactic, no TypeChecker).
 * Exported for testing.
 */
export function extractTopLevelNames(sourceFile: SourceFile): string[] {
  const names = new Set<string>();

  // Function declarations
  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (name) names.add(name);
  }

  // Class declarations
  for (const cls of sourceFile.getClasses()) {
    const name = cls.getName();
    if (name) names.add(name);
  }

  // Interfaces
  for (const iface of sourceFile.getInterfaces()) {
    names.add(iface.getName());
  }

  // Type aliases
  for (const ta of sourceFile.getTypeAliases()) {
    names.add(ta.getName());
  }

  // Enums
  for (const en of sourceFile.getEnums()) {
    names.add(en.getName());
  }

  // Module-scope variable declarations (only direct children of SourceFile)
  for (const stmt of sourceFile.getVariableStatements()) {
    // Only include module-level statements (parent is the SourceFile)
    if (stmt.getParent() !== sourceFile) continue;
    for (const decl of stmt.getDeclarations()) {
      names.add(decl.getName());
    }
  }

  // Namespace / module declarations at top level
  for (const ns of sourceFile.getDescendantsOfKind(SyntaxKind.ModuleDeclaration)) {
    if (ns.getParent() === sourceFile) {
      names.add(ns.getName());
    }
  }

  return [...names];
}

/**
 * Computes symbol-level undeclared changes for a single file.
 *
 * @param sourceFile   Parsed post-diff source file
 * @param path         Relative path (used in UndeclaredFinding)
 * @param coveredSymbols  Set of symbols named in claims targeting this file
 */
export function computeUndeclaredSymbols(
  sourceFile: SourceFile,
  path: string,
  coveredSymbols: ReadonlySet<string>,
): UndeclaredFinding[] {
  const topLevelNames = extractTopLevelNames(sourceFile);
  return topLevelNames
    .filter((name) => !coveredSymbols.has(name))
    .sort()
    .map((symbol) => ({ type: "symbol" as const, path, symbol }));
}

/**
 * Builds the full covered-symbol set for a given file path by scanning manifest claims.
 * For endpoint claims ("METHOD /path"), the route string is used as-is.
 */
export function buildCoveredSymbolSet(manifest: Manifest, filePath: string): Set<string> {
  const covered = new Set<string>();
  for (const claim of manifest.claims) {
    if (claim.target.path !== filePath) continue;
    if (claim.target.symbol) covered.add(claim.target.symbol);
  }
  return covered;
}
