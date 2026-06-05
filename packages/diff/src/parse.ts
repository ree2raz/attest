import type { DiffLine, FileDiff, FileOp, Hunk, ParsedDiff } from "./types.js";

/**
 * Parse a unified diff (the output of `git diff` / `git format-patch`) into a
 * {@link ParsedDiff}. Self-contained by design — see types.ts.
 *
 * Supported constructs: `diff --git` file headers, `new file` / `deleted file`
 * modes, `rename from`/`rename to`, `--- ` / `+++ ` path lines (with `a/`,`b/`
 * prefixes or `/dev/null`), `@@` hunk headers, and `Binary files ... differ`.
 * Renames are surfaced as a `delete` of the old path plus a `create` of the new
 * path (SPEC: renames are treated as delete + add).
 */
export function parseDiff(text: string): ParsedDiff {
  if (!text.trim()) return { files: [] };

  const lines = text.split("\n");
  const files: FileDiff[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (!line.startsWith("diff --git ")) {
      i++;
      continue;
    }

    // Header paths from `diff --git a/<old> b/<new>` as a fallback; the `---`/`+++`
    // lines below are authoritative when present.
    const header = parseGitHeaderPaths(line);
    let fromPath: string | null = header.from;
    let toPath: string | null = header.to;
    let isNew = false;
    let isDeleted = false;
    let renameFrom: string | null = null;
    let renameTo: string | null = null;
    let binary = false;
    const hunks: Hunk[] = [];

    i++;
    // Consume the extended header lines until the first hunk or the next file.
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (l.startsWith("diff --git ") || l.startsWith("@@")) break;

      if (l.startsWith("new file mode")) isNew = true;
      else if (l.startsWith("deleted file mode")) isDeleted = true;
      else if (l.startsWith("rename from ")) renameFrom = l.slice("rename from ".length);
      else if (l.startsWith("rename to ")) renameTo = l.slice("rename to ".length);
      else if (l.startsWith("--- ")) fromPath = stripPathMarker(l.slice(4));
      else if (l.startsWith("+++ ")) toPath = stripPathMarker(l.slice(4));
      else if (l.startsWith("Binary files ") || l.startsWith("GIT binary patch")) binary = true;
      i++;
    }

    // Parse hunks belonging to this file.
    while (i < lines.length && (lines[i] ?? "").startsWith("@@")) {
      const hunk = parseHunk(lines, i);
      hunks.push(hunk.hunk);
      i = hunk.next;
    }

    if (renameFrom !== null && renameTo !== null) {
      // delete(old) + create(new); any modify hunks attach to the create side.
      files.push(makeFileDiff(renameFrom, renameFrom, null, "delete", binary, []));
      files.push(makeFileDiff(renameTo, null, renameTo, "create", binary, hunks));
      continue;
    }

    const op: FileOp = isNew ? "create" : isDeleted ? "delete" : "modify";
    const resolvedOld = isNew ? null : fromPath;
    const resolvedNew = isDeleted ? null : toPath;
    const path = op === "delete" ? (resolvedOld ?? fromPath ?? "") : (resolvedNew ?? toPath ?? "");

    if (!path) continue;
    files.push(makeFileDiff(path, resolvedOld, resolvedNew, op, binary, hunks));
  }

  return { files };
}

function makeFileDiff(
  path: string,
  oldPath: string | null,
  newPath: string | null,
  op: FileOp,
  binary: boolean,
  hunks: Hunk[],
): FileDiff {
  return { path, oldPath, newPath, op, binary, hunks };
}

/** Extract `a/<from>` and `b/<to>` from a `diff --git` line. */
function parseGitHeaderPaths(line: string): { from: string | null; to: string | null } {
  const rest = line.slice("diff --git ".length).trim();
  // Paths are space-separated; quoted/space-containing paths are rare in the
  // corpus. Split on the last ` b/` boundary to be resilient to a space-free path.
  const marker = rest.indexOf(" b/");
  if (marker === -1) return { from: null, to: null };
  const from = stripPathMarker(rest.slice(0, marker));
  const to = stripPathMarker(rest.slice(marker + 1));
  return { from, to };
}

/** Strip a leading `a/`/`b/` prefix and resolve `/dev/null` to null-equivalent "". */
function stripPathMarker(raw: string): string {
  // Drop a trailing tab + timestamp that some diff producers append.
  const tab = raw.indexOf("\t");
  let p = tab === -1 ? raw : raw.slice(0, tab);
  p = p.trim();
  if (p === "/dev/null") return "";
  if (p.startsWith("a/") || p.startsWith("b/")) return p.slice(2);
  return p;
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function parseHunk(lines: string[], start: number): { hunk: Hunk; next: number } {
  const headerLine = lines[start] ?? "";
  const m = HUNK_RE.exec(headerLine);
  if (!m) {
    // Not a well-formed hunk header; emit an empty hunk and advance one line.
    return {
      hunk: { oldStart: 0, oldLines: 0, newStart: 0, newLines: 0, header: "", lines: [] },
      next: start + 1,
    };
  }

  const oldStart = Number(m[1]);
  const oldLines = m[2] === undefined ? 1 : Number(m[2]);
  const newStart = Number(m[3]);
  const newLines = m[4] === undefined ? 1 : Number(m[4]);
  const header = (m[5] ?? "").replace(/^\s/, "");

  const body: DiffLine[] = [];
  let oldCursor = oldStart;
  let newCursor = newStart;
  let i = start + 1;

  for (; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (l.startsWith("@@") || l.startsWith("diff --git ")) break;
    if (l.startsWith("\\")) continue; // "\ No newline at end of file"
    // Hunk-body lines always carry a marker (`+`/`-`/space). A zero-length line
    // is the trailing artifact of splitting on "\n" (or a stray separator), not
    // a blank context line — a blank context line is encoded as a single space.
    if (l === "") break;

    const marker = l[0] ?? " ";
    const content = l.slice(1);

    if (marker === "+") {
      body.push({ type: "add", content, oldLine: null, newLine: newCursor });
      newCursor++;
    } else if (marker === "-") {
      body.push({ type: "del", content, oldLine: oldCursor, newLine: null });
      oldCursor++;
    } else {
      // Context line (leading space). A truly empty line within a hunk is also
      // context (some producers emit "" rather than " ").
      body.push({ type: "context", content, oldLine: oldCursor, newLine: newCursor });
      oldCursor++;
      newCursor++;
    }
  }

  return {
    hunk: { oldStart, oldLines, newStart, newLines, header, lines: body },
    next: i,
  };
}
