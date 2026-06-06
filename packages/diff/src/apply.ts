import type { FileDiff } from "./types.js";

/**
 * Reconstruct post-change file content from the pre-change content plus a
 * {@link FileDiff} (SPEC §6.2: "reconstruct from base + diff"). Deterministic;
 * the symbols verifier can feed the result to tree-sitter without touching a
 * worktree.
 *
 * Assumption (Phase 1): files are newline-terminated. The reconstructed content
 * is newline-terminated iff non-empty. The rare `\ No newline at end of file`
 * case is a bounded follow-on (no corpus case exercises it).
 *
 * Throws if a hunk's context/deletion lines do not match `baseContent` at the
 * declared position — a mismatch means the diff was not produced against this
 * base, and silently patching anyway would corrupt the reconstruction.
 */
export function applyFileDiff(baseContent: string, file: FileDiff): string {
  if (file.op === "delete") return "";
  if (file.binary) {
    throw new Error(`cannot reconstruct binary file content for ${file.path}`);
  }

  const baseLines = splitLines(baseContent);
  const out: string[] = [];
  let cursor = 0; // 0-based index into baseLines

  const hunks = [...file.hunks].sort((a, b) => a.oldStart - b.oldStart);

  for (const hunk of hunks) {
    const hunkStart = Math.max(0, hunk.oldStart - 1);
    // Copy untouched lines preceding the hunk.
    for (; cursor < hunkStart; cursor++) {
      out.push(baseLines[cursor] ?? "");
    }

    for (const line of hunk.lines) {
      if (line.type === "add") {
        out.push(line.content);
      } else if (line.type === "context") {
        assertMatch(baseLines[cursor], line.content, file.path, cursor + 1);
        out.push(line.content);
        cursor++;
      } else {
        // del: must match base, consumed and dropped.
        assertMatch(baseLines[cursor], line.content, file.path, cursor + 1);
        cursor++;
      }
    }
  }

  // Trailing untouched lines.
  for (; cursor < baseLines.length; cursor++) {
    out.push(baseLines[cursor] ?? "");
  }

  return out.length === 0 ? "" : out.join("\n") + "\n";
}

/** Split into content lines, treating a single trailing newline as a terminator. */
function splitLines(content: string): string[] {
  if (content === "") return [];
  const normalized = content.endsWith("\n") ? content.slice(0, -1) : content;
  return normalized.split("\n");
}

function assertMatch(
  actual: string | undefined,
  expected: string,
  path: string,
  lineNo: number,
): void {
  if (actual !== expected) {
    throw new Error(
      `diff does not apply to base for ${path} at line ${lineNo}: ` +
        `expected ${JSON.stringify(expected)}, base has ${JSON.stringify(actual ?? null)}`,
    );
  }
}
