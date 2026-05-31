# attest — Roadmap & Scope

This file defines the scope of each release after v0.1. v0.1 is shipped and frozen
(see `docs/PROJECT_SPEC.md` §4 for what it covers). The governing principles below
are inherited from the v0.1 spec and are **non-negotiable across all versions**:

- Deterministic checks only — no LLM inference anywhere in the verification path.
- The schema is the product; schema stability outranks feature count.
- Stateless by default; no hosted service, no accounts.
- Every rejection returns a structured, actionable reason code.

---

## v0.2 — Breadth of behavior, plus agent integration

**Thesis**: v0.1 proved the core loop on one behavior (`authentication`) in one language
(TypeScript). v0.2 proves the loop generalizes — across more behavioral properties and
into the agent's own workflow via MCP — without changing the schema shape.

### IN (must ship)

1. **Remaining TypeScript behavioral detectors.** Implement the nine `BehavioralProperty`
   values not covered in v0.1, each as a dedicated detector with its own fixture suite
   (≥10 fixtures each, same `*.expected.json` convention as `authentication`):
   - `input_validation`
   - `error_handling`
   - `null_check`
   - `authorization`
   - `rate_limiting`
   - `logging`
   - `sanitization`
   - `timeout`
   - `retry_logic`

   Suggested sequencing (highest reviewer value first): `input_validation` →
   `error_handling` → `authorization` → `null_check` → `sanitization` →
   `rate_limiting` → `logging` → `timeout` → `retry_logic`. Each ships as its own PR.

2. **`@attest/mcp` — Model Context Protocol server.** Exposes `attest verify` as an MCP
   tool so an agent can self-verify its claims inside the editing session, before handing
   off to a human. Stateless: manifest + diff + repo-root in, `VerdictReport` out. Reuses
   `@attest/core` verbatim — no verification logic lives in the MCP layer.

3. **Pre-declaration / TDD-style flow.** Allow a manifest to be emitted _before_ the diff
   exists (claims as intent), then verified against the diff once changes land. Requires a
   manifest `mode` discriminator (`declared` vs `asserted`) — this is the one permitted
   schema addition in v0.2 and triggers `schema_version` `0.2`.

4. **Published npm packages.** Release `@attest/schema`, `@attest/core`, `@attest/cli`
   (and `@attest/mcp`) to npm under the `@attest/*` scope via changesets. v0.1 was
   repo-local only; v0.2 is the first installable release.

### OUT (deferred)

- GitHub App / PR-comment renderer → **v0.3**
- Python-language detectors → **v0.3** (port the detector framework to a Python AST
  backend once the TS behavioral catalog is complete and stable)
- Multi-session provenance chaining → **v0.3+**
- Test _execution_ or coverage measurement — **never** (we check test _presence_, never
  _behavior_; defer to c8/istanbul/Codecov)
- Any form of LLM inference in the verifier — **never**

### Definition of "v0.2 ready"

- [ ] All ten TS behavioral detectors implemented; each fixture matches its expected verdict exactly
- [ ] Each detector ≥85% line coverage (same gate as `authentication` in v0.1)
- [ ] `@attest/mcp` server starts, registers the `verify` tool, returns a `VerdictReport` for the golden-path inputs
- [ ] Schema `0.2` adds only the `mode` discriminator; `0.1` manifests still validate (or are explicitly rejected with a version reason code — decide and document)
- [ ] `pnpm lint && pnpm test && pnpm build` green from a clean checkout
- [ ] Packages publishable: `changeset version` + dry-run `pnpm publish --dry-run` succeed
- [ ] README documents MCP setup and the pre-declaration flow
- [ ] SCOPE.md and PROJECT_SPEC.md updated to reflect shipped scope

### What would invalidate this plan

- If adding a second behavioral detector forces a schema change beyond `mode`, the
  "schema is stable" assumption is wrong — stop and revise the schema spec before
  building the remaining eight.
- If MCP adoption among target agents stalls, demote `@attest/mcp` below the detector
  work; the detectors are the load-bearing deliverable.

---

## v0.3 — Surface and second language (sketch, not yet committed)

- GitHub App / PR-comment renderer: post the `VerdictReport` as a PR review comment,
  with `reviewer_focus` as the comment body. Reuses `@attest/core`; adds only a renderer
  and a webhook handler.
- `@attest/detectors-py`: Python-language detectors, beginning with `authentication`,
  reusing the v0.2 detector interface against a Python AST backend.
- Multi-session provenance chaining: link manifests across sessions to verify a sequence
  of agent handoffs.

This section is a direction, not a contract. It will be promoted to a full IN/OUT scope
when v0.2 is shipped.
