# SESSION_REPORT — attest v0.1

**Date**: 2026-05-26  
**Agent**: claude-sonnet-4-6 (Claude Code)  
**Commits**: `1e22ae7` → `09848ea` (6 commits total)

---

## What shipped

All six checklist items from the project spec are complete.

| Package | Commit | Summary |
|---|---|---|
| Monorepo scaffold | `1e22ae7` | Root config, pnpm workspace, 4 package stubs, CI workflow, README, CONTRIBUTING, LICENSE |
| `@attest/schema` | `08cd55c` | JSON Schema v0.1, TypeScript types, ajv validator, hard-fail rules 1/3/4, 10 tests |
| `@attest/core` | `4153295` | Diff parser (parse-diff), 5 check implementations, undeclared-changes detector, verifier orchestration, manifest hash, reviewer_focus builder, 24 tests |
| `@attest/detectors-ts` | `06a5a30` | Authentication detector for Express/Fastify/NestJS/Koa/raw-Node, 3-layer classification, 18 fixtures, ≥85% line coverage gate, 25 tests |
| `@attest/cli` | `09848ea` | `attest verify` command, human renderer (ANSI), JSON renderer, golden-path e2e test, 6 tests |

**Final test count**: 65 tests, 0 failures across all packages.

---

## Architecture decisions

### Post-diff file reads from disk
The spec says "post-diff content" — the verifier reads files directly from `repoRoot` at runtime rather than applying the diff programmatically. This keeps the implementation simple and correct: the caller is responsible for having the post-diff state checked out.

### Detector interface lives in `@attest/core`
Placing `Detector` and `DetectorContext` in `@attest/core` avoids a circular dependency (`detectors-ts → core` not `core ↔ detectors-ts`). `@attest/detectors-ts` re-exports these types from `@attest/core/src/detector.ts` for convenience.

### Reviewer focus reasons centralized in core
Both the JSON output and human text use the same `reason` string. Producing these strings in `buildReviewerFocus` (core) rather than in the CLI renderer ensures the spec §5.1 templates are applied consistently regardless of output format.

### No-note evidence entry pattern
The authentication detector places `{ kind: "route", path, symbol }` (no `note`) as the first evidence entry. This lets the CLI's `evidenceSummary` fall through to Rule 2 (humanized `reason_code`) or Rule 3 (target fallback) per §5.3. The same pattern was applied to `checkSymbolExists` for endpoint targets.

### Inline `express()` in golden-path fixture
Using `const app = express()` would create a module-level `app` symbol that `extractTopLevelNames` picks up as an undeclared finding. The fixture uses `express().post(...)` directly to produce exactly one undeclared symbol (`unlistedHelper`) as the spec example requires.

---

## Ambiguities encountered and how they were resolved

### 1. `reason_code` for empty middleware chain
The spec fixture `express-no-auth.expected.json` expected `reason_code: "no_auth_in_chain"`. An early implementation returned `no_middleware_chain` for the case where `app.use()` calls existed but none classified as auth. Resolution: merged both cases into `no_auth_in_chain` — the chain is "not auth" whether it's empty or present-but-wrong.

### 2. `behavior_present` reviewer focus template
The spec says the reason for `behavior_present` failures must be `"<id> failed — <property humanized> not detected"`. The property lives in `vc.params.property`, which the CLI renderer doesn't have direct access to. Resolution: `buildReviewerFocus` in `verdict.ts` receives the full `Manifest` and applies the template there.

### 3. `fastify.route({preHandler: [...]})` hook detection
`fastifyRouteHooks` initially checked `args.slice(1)` (the route handler position), missing that for `fastify.route({...})` the entire config object including `preHandler` is in `args[0]`. Resolution: iterate over all args.

### 4. `express.json()` classified as `unknown`
Layer 1 classification checked the full call expression name (`express.json()`), which doesn't match any positive/negative pattern, yielding `unknown`. Resolution: extract the leaf method name (`json`) and check it against the negative list; `json` is in the list and returns `not-auth`.

### 5. parse-diff hunk line count sensitivity
`parse-diff` strictly enforces the line count in `@@ -a,b +c,N @@` headers. A test diff with `+1,7` but only 2 added lines caused the parser to consume the next `diff --git` header as a hunk line, corrupting the second file's path. Resolution: always match `N` to the actual number of added/removed lines.

---

## Open questions / known limitations

1. **Cross-file middleware**: if auth middleware is defined in another file and imported as a variable, Layer 1 name classification is the only signal. A false-negative is possible if the variable name does not match any pattern (e.g., `app.use(mw)`). Resolving this would require cross-file type tracing, which conflicts with the syntactic-only constraint.

2. **NestJS global guards** (`APP_GUARD`, `useGlobalGuards`): these are applied at module bootstrap, not per-controller. The detector cannot see them from a single file and always returns `partial` for NestJS routes without local `@UseGuards`. This is the correct conservative behavior but may produce false partial verdicts for well-guarded apps.

3. **Coverage gate on `src/authentication/` only**: the vitest coverage threshold is set on the three authentication source files. Future detectors should add their own `thresholds` entry in `vitest.config.ts`; the global coverage will stay below 100%.

4. **Only `authentication` behavioral property implemented**: all other `behavior_present` claims with other properties (e.g., `null_check`, `rate_limiting`) return `unverifiable` / `detector_not_implemented`. Each property needs its own detector following the same interface.

5. **Diff format assumption**: `parseDiffContent` depends on unified diff format (`git diff` output). Other diff formats (e.g., context diffs) are not supported.

---

## Test coverage summary (final)

| Package | Test files | Tests | Lines |
|---|---|---|---|
| `@attest/schema` | 3 | 10 | n/a (types + ajv) |
| `@attest/core` | 4 | 24 | n/a |
| `@attest/detectors-ts` | 2 | 25 | 90.78% (src/authentication/) |
| `@attest/cli` | 2 | 6 | n/a |
| **Total** | **11** | **65** | |
