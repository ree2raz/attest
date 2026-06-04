# Build log

Short, append-only record of work units (SPEC §11.4) for cross-session continuity.
Newest last.

## WU1 — `@attest/schema` rebuilt to v1.0 contracts (2026-06-04)

Replaced the v0.1 schema package wholesale (clean-rebuild decision).

- **Manifest** (`manifest.schema.json`, §4.1): new shape — `attest_version`, `task`,
  `agent`, `generated_at`, `declared_scope.files`, closed claim taxonomy
  (`file_change`, `symbol_added/removed/modified`, `test_added/modified`, `outcome`).
  Known kinds validated strictly via `allOf`/`if-then`; **unknown kinds pass
  validation** (verifier reports them `unverifiable` / `unsupported_claim_kind`, never
  rejected here) and a smuggled semantic `description` is allowed-but-ignored.
- **Verdict** (`verdict.schema.json`, §4.2): `result` (pass/fail), `exit_code` (0/1),
  per-claim `status` (verified/failed/unverifiable) with required `reason` on
  failed/unverifiable, `undeclared_changes`, `summary`.
- **Audit** (`audit.schema.json`, §4.3): PROVISIONAL stub, types only wired; finalized
  in Phase 3.
- **Validator**: `createManifestValidator` / `createVerdictValidator`, generic
  `{ ok, value | errors }`. **The v0.1 `behavior_present` semantic params check is
  gone** with the semantic model. Raw schemas exported (`MANIFEST_SCHEMA`,
  `VERDICT_SCHEMA`, `AUDIT_SCHEMA`) for the future `attest schema` command.
- Bumped to `1.0.0`; build copies all three schema JSONs to `dist/`.
- Green in isolation: build ✓, typecheck ✓, 25 tests ✓, eslint ✓, prettier ✓.

**Expected red:** `@attest/core`, `@attest/cli`, `@attest/detectors-ts` still import
the v0.1 API and will not typecheck/build until their work units (WU5/WU7/WU8). This
is inherent to the bottom-up clean rebuild.

**Env note:** machine had no pnpm; installed pnpm 11 globally (repo pins pnpm 9).
pnpm 11 ignores the repo's `package.json#pnpm.onlyBuiltDependencies`, so esbuild's
native build is skipped and pnpm's pre-run deps check aborts scripts — work around
with `npm_config_verify_deps_before_run=false` (after a one-time `pnpm rebuild
esbuild`). Did **not** migrate the committed pnpm config (out of scope, would affect
pnpm-9 users).

**Next:** WU2 — fixture corpus (TS/Py/Go, the 7 oracle case classes, §10).

## WU2 — fixture corpus / regression oracle (2026-06-04)

Built `corpus/` (SPEC §10). Each case = a per-language `base/` repo + an `overlay/`
(post-change files only) + `manifest.json` + generated `change.diff` +
`expected-verdict.json`. Working tree = base overlaid with overlay; diff =
`git diff(base → tree)`. Lean (no full-tree duplication) and the diffs are generated,
not hand-counted.

- **Cases:** TS full set — honest, lying, partial, undeclared, allowlisted,
  outcome-fail, behavioral. Python + Go — honest, lying, undeclared (the core trio
  proving language-agnostic structural verification + the undeclared moat). 13 cases.
- **Conventions** (documented in `corpus/README.md`): the WU5/WU9 harness asserts the
  **stable projection** of the verdict — `result`, `exit_code`, `summary`, each claim's
  `id`+`status` (and reason-present for failed/unverifiable), and `undeclared_changes`
  fields — but NOT `evidence` or exact `reason` text (non-deterministic). So
  `expected-verdict.json` omits evidence. Allowlisted changes are listed with
  `severity: "suppressed"` and excluded from `summary.undeclared`. The behavioral case
  expects `unverifiable` + **`pass`/exit 0** (unverifiable is an allowed status, §6.6).
- **Tooling:** `tools/generate-diffs.sh` (forces `a/ b/` prefixes regardless of the
  user's `diff.mnemonicPrefix`), `tools/build-tree.sh`, `tools/validate.mjs`.
- **Verified now:** all 13 manifests + 13 verdicts validate against `@attest/schema`
  (`node corpus/tools/validate.mjs`); every case's `change.diff` applied to `base`
  reproduces the build-tree output (triangle consistency); prettier clean repo-wide.
- Added `.prettierignore` so fixture `base/`/`overlay/` trees, `.diff`, and tool
  `.sh` files are never reformatted (reformatting a fixture would silently invalidate
  its diff) — `pnpm format:check` now passes with the corpus present.

**Note:** expected verdicts are the oracle's source of truth, authored from the spec
ahead of the engine. When WU5 lands, the engine must conform to them (a change that
breaks an oracle case is wrong by definition); minor reason/evidence shapes may be
tuned, but statuses/exit codes/undeclared sets are fixed.

**Coverage gap (intentional):** Py/Go partial, allowlisted, outcome-fail, behavioral
cells are unfilled — well-bounded routine follow-on (copy the TS pattern).

**Next:** WU3 — `@attest/diff` (extract unified-diff parsing into its own package).
