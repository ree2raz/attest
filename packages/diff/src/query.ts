import type { DiffLine, FileDiff, ParsedDiff } from "./types.js";

/**
 * Small, allocation-light query helpers over a {@link ParsedDiff}. These exist so
 * the core verifier (SPEC §6.2/§6.3) never re-walks the raw diff text.
 */

/** Set of every path touched by the diff — the `actual_files` of §6.3. */
export function changedPaths(diff: ParsedDiff): string[] {
  return diff.files.map((f) => f.path);
}

/**
 * Locate the change for a given repo-relative path. When a path is both deleted
 * and created (a rename surfaced as delete+create), the `create` side wins, since
 * that is the post-change file a claim would target.
 */
export function findFile(diff: ParsedDiff, path: string): FileDiff | undefined {
  let fallback: FileDiff | undefined;
  for (const f of diff.files) {
    if (f.path !== path) continue;
    if (f.op !== "delete") return f;
    fallback ??= f;
  }
  return fallback;
}

/** Total hunk count for a file — used as `evidence.hunks` (SPEC §4.2 example). */
export function hunkCount(file: FileDiff): number {
  return file.hunks.length;
}

/** Lines added by a file change, in order. */
export function addedLines(file: FileDiff): DiffLine[] {
  return collect(file, "add");
}

/** Lines removed by a file change, in order. */
export function removedLines(file: FileDiff): DiffLine[] {
  return collect(file, "del");
}

function collect(file: FileDiff, type: DiffLine["type"]): DiffLine[] {
  const out: DiffLine[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === type) out.push(line);
    }
  }
  return out;
}
