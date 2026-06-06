/**
 * Structured model of a unified diff (SPEC §5 `@attest/diff`, §6.2/§6.3).
 *
 * The parser is intentionally self-contained (no third-party diff library): the
 * verification path must be deterministic and fully under our control, and the
 * fixture corpus (§10) is the regression oracle for this model.
 */

/**
 * File-level operation, named to match the manifest claim taxonomy
 * (`file_change.op`, SPEC §4.1) so the verifier can compare without translation.
 */
export type FileOp = "create" | "modify" | "delete";

/** Classification of a single line inside a hunk. */
export type DiffLineType = "add" | "del" | "context";

/**
 * One line within a hunk, carrying the line numbers on both sides so a consumer
 * can reconstruct pre-/post-change file state (SPEC §6.2) without re-parsing.
 *
 * - `add`     lines exist only after  → `newLine` set, `oldLine` null
 * - `del`     lines exist only before → `oldLine` set, `newLine` null
 * - `context` lines exist on both     → both set
 */
export interface DiffLine {
  type: DiffLineType;
  /** Line content, without the leading `+`/`-`/` ` marker and without newline. */
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

/** A single `@@ -oldStart,oldLines +newStart,newLines @@` hunk. */
export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Trailing context after the closing `@@` (often the enclosing function). */
  header: string;
  lines: DiffLine[];
}

/** All changes to a single file. */
export interface FileDiff {
  /**
   * Canonical repo-relative path for this change: the post-change path for
   * `create`/`modify`, the pre-change path for `delete`.
   */
  path: string;
  /** Path on the `---` (from) side; null for `create`. */
  oldPath: string | null;
  /** Path on the `+++` (to) side; null for `delete`. */
  newPath: string | null;
  op: FileOp;
  /** True for `Binary files ... differ` / `GIT binary patch`; `hunks` is empty. */
  binary: boolean;
  hunks: Hunk[];
}

/** Parsed unified diff: an ordered list of per-file changes. */
export interface ParsedDiff {
  files: FileDiff[];
}
