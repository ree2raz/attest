# CLAUDE.md

`docs/SPEC.md` is the authoritative spec. Read it before making design decisions;
when code conflicts with it, the code is wrong until the spec is deliberately changed.

**attest verifies structure and outcomes, never behavior or semantics.** Hard rules
(from SPEC §2):

- No LLM anywhere in the verification path. Determinism is the product.
- No semantic/behavioral verification. Behavioral claims return `unverifiable` with
  an LLM-review pointer — never a heuristic. Do **not** (re)introduce semantic
  detectors into the verification path.
- `@attest/detectors-ts` is a demoted, opt-in, best-effort plugin. It must never
  affect the exit code or gate CI.

The fixture corpus (SPEC §10) is the regression oracle: a change that breaks an
oracle case is wrong by definition.
