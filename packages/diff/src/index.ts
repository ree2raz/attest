export type { DiffLine, DiffLineType, FileDiff, FileOp, Hunk, ParsedDiff } from "./types.js";

export { parseDiff } from "./parse.js";
export { applyFileDiff } from "./apply.js";
export { addedLines, changedPaths, findFile, hunkCount, removedLines } from "./query.js";
