import { diffSymbols, locateSymbol } from "@attest/symbols";
import type { SymbolDecl } from "@attest/symbols";
import type {
  ClaimResult,
  SymbolAddedClaim,
  SymbolModifiedClaim,
  SymbolRemovedClaim,
} from "@attest/schema";
import type { Sources } from "../sources.js";
import { failed, verified } from "./result.js";

type SymbolClaim = SymbolAddedClaim | SymbolRemovedClaim | SymbolModifiedClaim;

/**
 * `symbol_added|removed|modified` (SPEC §6.2): compute the structural symbol delta
 * for the file (post vs base via tree-sitter) and confirm the named symbol appears
 * in the claimed set. Exists/kind only — never behavior.
 */
export async function verifySymbol(claim: SymbolClaim, sources: Sources): Promise<ClaimResult> {
  const base = await sources.baseSymbols(claim.path);
  const post = await sources.postSymbols(claim.path);
  const delta = diffSymbols(base, post);

  let set: SymbolDecl[];
  let verb: string;
  switch (claim.kind) {
    case "symbol_added":
      set = delta.added;
      verb = "added";
      break;
    case "symbol_removed":
      set = delta.removed;
      verb = "removed";
      break;
    case "symbol_modified":
      set = delta.modified;
      verb = "modified";
      break;
  }

  const found = locateSymbol(set, claim.symbol, claim.symbol_kind);
  if (found) return verified(claim.id, { node_kind: found.nodeKind, line: found.line });
  return failed(
    claim.id,
    `symbol '${claim.symbol}' (${claim.symbol_kind}) was not ${verb} in ${claim.path}`,
  );
}
