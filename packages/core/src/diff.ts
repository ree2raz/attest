import parseDiff from "parse-diff";
import type { DiffChange, DiffSet } from "./types.js";

/**
 * Parses a unified diff string (output of `git diff` / `git format-patch`) into a DiffSet.
 * Binary files are included with empty hunks so the undeclared detector can still flag them.
 * Renames are treated as delete + add (per spec).
 */
export function parseDiffContent(diffText: string): DiffSet {
  if (!diffText.trim()) return { changes: [] };

  const files = parseDiff(diffText);
  const changes: DiffChange[] = [];

  for (const file of files) {
    const toPath = file.to ?? "";
    const fromPath = file.from ?? "";

    // Determine the effective path and change kind
    let path: string;
    let kind: DiffChange["kind"];

    if (file.new === true || fromPath === "/dev/null" || fromPath === "") {
      path = toPath;
      kind = "added";
    } else if (file.deleted === true || toPath === "/dev/null" || toPath === "") {
      path = fromPath;
      kind = "deleted";
    } else {
      path = toPath || fromPath;
      kind = "modified";
    }

    if (!path || path === "/dev/null") continue;

    changes.push({
      path,
      kind,
      hunks: file.chunks ?? [],
    });
  }

  return { changes };
}
