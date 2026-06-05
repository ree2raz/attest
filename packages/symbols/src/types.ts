import type { SymbolKind } from "@attest/schema";

/**
 * Language-agnostic symbol extraction (SPEC §5.1). The one operation: given a
 * file's source plus a `symbol` + `symbol_kind`, answer whether a declaration node
 * of that kind with that name exists, and where. **Structure only — never
 * behavior.** No detector logic, ever.
 */

export type { SymbolKind };

/** Phase-1 languages (SPEC §6): TypeScript, TSX, Python, Go. */
export type Lang = "ts" | "tsx" | "py" | "go";

/**
 * A declaration found in a parse tree.
 *
 * `kinds` is the set of `symbol_kind` values this single declaration satisfies,
 * with the canonical one first in `kind`. Most declarations satisfy exactly one
 * kind; the exception is a Python module-level binding, which the grammar cannot
 * distinguish as `constant` vs `variable` (that distinction is convention, i.e.
 * semantic — out of scope), so it satisfies both.
 */
export interface SymbolDecl {
  name: string;
  /** Canonical kind (first of `kinds`). */
  kind: SymbolKind;
  /** Every `symbol_kind` this declaration can satisfy. */
  kinds: SymbolKind[];
  /** Grammar node type, surfaced as verdict `evidence.node_kind` (SPEC §4.2). */
  nodeKind: string;
  /** 1-based line of the declaration's first line (`evidence.line`). */
  line: number;
  /** 1-based line of the declaration's last line. */
  endLine: number;
  /** Verbatim source slice of the declaration — used for `modified` detection. */
  text: string;
}

/**
 * Structural symbol delta between a file's pre- and post-change states. Identity
 * is (name, canonical kind). `modified` = present on both sides with a changed
 * declaration source slice — a deterministic text comparison, not a behavioral one.
 */
export interface SymbolDelta {
  added: SymbolDecl[];
  removed: SymbolDecl[];
  modified: SymbolDecl[];
}
