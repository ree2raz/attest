import { isKnownClaim } from "@attest/schema";
import type { Claim, ClaimResult } from "@attest/schema";
import type { ParsedDiff } from "@attest/diff";
import type { Sources } from "./sources.js";
import type { AttestConfig, OutcomeResults } from "./types.js";
import { verifyFileChange } from "./verifiers/file-change.js";
import { verifyOutcome } from "./verifiers/outcome.js";
import { verifySymbol } from "./verifiers/symbol.js";
import { verifyTest } from "./verifiers/test.js";
import { verifyUnsupported } from "./verifiers/unsupported.js";

export interface ClaimContext {
  diff: ParsedDiff;
  sources: Sources;
  config?: AttestConfig | undefined;
  outcomes?: OutcomeResults | undefined;
}

/** Route a single claim to its verifier (SPEC §6.2). */
export function verifyClaim(claim: Claim, ctx: ClaimContext): Promise<ClaimResult> | ClaimResult {
  if (!isKnownClaim(claim)) return verifyUnsupported(claim);

  switch (claim.kind) {
    case "file_change":
      return verifyFileChange(claim, ctx.diff);
    case "symbol_added":
    case "symbol_removed":
    case "symbol_modified":
      return verifySymbol(claim, ctx.sources);
    case "test_added":
    case "test_modified":
      return verifyTest(claim, ctx.diff, ctx.config);
    case "outcome":
      return verifyOutcome(claim, ctx.outcomes);
  }
}
