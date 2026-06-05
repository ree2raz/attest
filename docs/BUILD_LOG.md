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

## WU3 — `@attest/diff` unified-diff parser (2026-06-05)

New package `packages/diff` (SPEC §5, §6.2/§6.3). **Self-contained parser — no
third-party diff lib** (v0.1 used `parse-diff`); the verification path must be
deterministic and fully ours, and the corpus is the oracle for the model.

- **Model** (`types.ts`): `ParsedDiff → FileDiff[]`; each `FileDiff` has `op`
  (`create`/`modify`/`delete`, named to match the manifest `file_change.op` so the
  verifier compares without translation), `path`/`oldPath`/`newPath`, `binary`, and
  `Hunk[]`. Each `DiffLine` carries both `oldLine`/`newLine` so a consumer can
  reconstruct pre-/post state without re-parsing.
- **Parser** (`parse.ts`): handles `diff --git`, `new file`/`deleted file`,
  `rename from`/`to` (surfaced as **delete(old) + create(new)** per spec), `---`/`+++`
  with `a/`,`b/`,`/dev/null`, `@@` headers (omitted counts default to 1), and binary
  markers. Key correctness point: a zero-length line terminates a hunk body — git
  encodes a blank context line as a single space, so `""` is only the trailing
  split-on-`\n` artifact (this bit the first test run; now explicit).
- **Reconstruction** (`apply.ts`): `applyFileDiff(base, fileDiff)` rebuilds
  post-change content (SPEC §6.2 "reconstruct from base + diff") for the symbols
  verifier; **throws on context/deletion mismatch** rather than silently mis-patching
  a wrong base. Phase-1 assumption: newline-terminated files (the `\ No newline`
  case is an unexercised bounded follow-on).
- **Queries** (`query.ts`): `changedPaths` (the `actual_files` of §6.3), `findFile`
  (create side wins on rename collisions), `hunkCount` (`evidence.hunks`),
  `added`/`removedLines`.
- **Tests (54):** unit parse/apply + a **corpus oracle test** that reconstructs every
  created/modified file from `base + change.diff` and asserts byte-equality with the
  materialized `overlay/` — triangle consistency now enforced in code, not just by the
  generator script. Green in isolation: build ✓, typecheck ✓, 54 tests ✓, eslint ✓,
  prettier ✓.

**Still expected-red:** `@attest/core`, `@attest/cli`, `@attest/detectors-ts`
(v0.1 API) until WU5/WU7/WU8. `@attest/schema` + `@attest/diff` green in isolation.

**Next:** WU4 — `@attest/symbols` (tree-sitter symbol extraction, TS/Py/Go).

## WU4 — `@attest/symbols` tree-sitter extraction (2026-06-05)

New package `packages/symbols` (SPEC §5.1 — the architectural linchpin). One job:
_does a declaration of this name + kind exist, and where_ — **structure only, never
behavior. No detector logic.**

- **Runtime: WASM (`web-tree-sitter`), not native bindings.** No node-gyp/native
  compile (this machine already fights native builds), deterministic, portable.
  **Pinned `web-tree-sitter@0.22.6`** — 0.26 cannot load the prebuilt grammars
  (dylink/ABI mismatch: `tree-sitter-wasms@0.1.13` grammars are built against
  tree-sitter ~0.20). 0.22 uses the pre-0.25 default-export API
  (`Parser.init()` / `Parser.Language.load`).
- **Grammars vendored** under `grammars/*.wasm` (ts/tsx/py/go) via
  `scripts/vendor-grammars.mjs` (copies from `tree-sitter-wasms`, a devDep) so the
  package is self-contained at runtime. `grammars/` sits one level above both `src/`
  and `dist/`, so the same `../grammars` path resolves in test and built modes.
  Binary wasm is git-tracked and `.prettierignore`d.
- **Node-kind maps** grounded by probing the real grammars (not guessed): TS unwraps
  `export_statement`, treats `const f = () =>`/function-expression as `function`,
  `const`→`constant` else `variable`, methods from `class_body`; Python maps `def`→
  function (module) / method (in class), `class`, and a module binding to **both
  `constant` and `variable`** (the distinction is convention = semantic = out of
  scope); Go maps func/method/struct/interface/type/const/var incl. grouped specs.
  Recursion is shallow on purpose (top-level + class methods; **not** into function
  bodies) so undeclared-change detection stays low-noise.
- **API:** `extractSymbols(lang, source)` (async; grammars cached per process),
  `locateSymbol`/`symbolMatches` (a decl carries every `symbol_kind` it satisfies),
  `diffSymbols(before, after)` → added/removed/**modified** (modified = changed
  declaration source slice; a deterministic text compare, not behavioral),
  `langFromPath` (JS routes to the TS grammar). `SymbolKind` re-exported from
  `@attest/schema` (single source for the taxonomy).
- **Tests (18):** extraction across TS/TSX/Py/Go covering the full kind set + a
  corpus oracle that extracts the honest fixtures' post-change (overlay) sources and
  confirms each declared `symbol_added` resolves. Built-dist smoke test confirms the
  runtime grammar path. Green in isolation: build ✓, typecheck ✓, 18 tests ✓,
  eslint ✓, prettier ✓ (repo-wide `format:check` clean).

**Still expected-red:** `@attest/core`, `@attest/cli`, `@attest/detectors-ts` until
WU5/WU7/WU8. Migrated + green: schema, diff, symbols.

**Next:** WU5 — `@attest/core` (load manifest, the three verifiers, undeclared
detection, assemble verdict — the heart, judgment-heavy).

## WU5 — `@attest/core` verification engine (2026-06-05)

Clean-rebuilt `@attest/core` to v1.0 (deleted the v0.1 ts-morph/parse-diff/detector
internals). The heart: route each claim to a verifier, detect undeclared changes,
assemble a verdict that conforms to the corpus oracle.

- **No fs execution, no LLM, no semantics in the path.** Base file content is read
  from `repoRoot`; post-change content is **reconstructed deterministically** via
  `@attest/diff` `applyFileDiff` (no worktree needed for structural verification).
  `Sources` caches base/post content + symbols per run.
- **Verifiers** (`src/verifiers/`): `file_change` (diff op match), `symbol_*`
  (`diffSymbols` added/removed/modified + `locateSymbol`), `test_*` (diff hunk +
  test-file classification + a **structural `covers` reference check** — token match
  in added lines; unconfirmable → `unverifiable`, never a guess), `outcome` (compares
  **injected** runner results — core never shells out), and unknown/behavioral kinds
  → `unverifiable` with the `unsupported_claim_kind` LLM-review pointer (the Camp-3
  guard; never fails the build).
- **Undeclared moat** (`undeclared.ts`): walks the diff in order (so output matches
  diff order) — declared files emit intra-file **symbol drift** (added/modified
  symbols not named by a claim), undeclared files emit a file-level entry (suppressed
  if allowlisted: lockfiles + generated dirs). Key correctness call: **test files are
  skipped for symbol drift** — a declared test file's added `test_*`/`Test*` functions
  are expected, not scope drift (this is what keeps py/go `honest` at zero undeclared).
- **Exit policy** (§6.6): exit 0 iff every claim is `verified`/`unverifiable` AND zero
  flagged undeclared; `unverifiable` never fails; allowlisted (suppressed) excluded
  from `summary.undeclared`.
- **Tests (27):** the **corpus regression oracle** — `verify()` run against all 13
  cases, asserting the stable projection (result, exit_code, summary, claim id+status
  - reason-presence, full undeclared field set + order) — plus unit tests for paths
    the corpus doesn't reach (`symbol_removed`/`modified`, op mismatch, missing/failed
    outcome, non-test path, unsupported kind). All 13 oracle cases pass across TS/Py/Go.
- Green in isolation: build ✓, typecheck ✓, 27 tests ✓, eslint ✓, prettier ✓.

**Reason text note:** the corpus does NOT assert exact `reason` strings (only
presence). Core's reasons are close to the oracle text but need not byte-match.

## WU6 — `@attest/runner` outcome execution + isolation (2026-06-05)

New package `packages/runner` (SPEC §6.4). Executes `outcome` checks and returns
results the CLI feeds straight into `verify` (`RunOutcomes` is assignable to core's
`OutcomeResults`).

- **Worktree isolation is a correctness requirement, not polish.** `createWorktree`
  makes a detached `git worktree` at `baseRef` (default HEAD), optionally **applies
  the diff** to reach the post-change state, runs commands there, and always cleans up
  (idempotent). Commands never touch the live working tree. (Untrusted-code container
  isolation remains a Phase-3 gap — deliberately not closed by a worktree-less shortcut.)
- **Command resolution** (`detect.ts`): explicit `RunnerConfig` (build/test/lint_cmd)
  wins; else auto-detect — Node (package.json scripts, PM from lockfile), Go (`go
test/build/vet ./...`), Python (`pytest`; build/lint declined as too variable),
  Makefile targets. **No command resolvable → the check is omitted**, so core marks it
  `unverifiable` rather than guessing.
- **Execution** (`exec.ts`): `sh -c`, captures exit code, wall-clock duration, and
  head/tail-**truncated** combined log; a timeout/kill maps to exit 124 (fails, never
  silently passes).
- Config-file parsing (attest.toml/json) is intentionally the CLI's job (WU7); the
  runner takes a `RunnerConfig` object.
- **Tests (16):** pure detection table + real-temp-git-repo execution proving exit-code
  capture, **isolation** (a `touch SENTINEL` side effect never leaks to the repo),
  **diff application** (post-change file present only with the diff), log truncation,
  unresolved-check omission, and zero leftover worktrees. Green in isolation: build ✓,
  typecheck ✓, 16 tests ✓, eslint ✓, prettier ✓.

**Migrated + green:** schema, diff, symbols, core, runner (140 tests total).
**Still expected-red:** `@attest/cli`, `@attest/detectors-ts` (v0.1 API) until WU7/WU8.

**Next:** WU7 — `@attest/cli` (wire manifest+diff+runner+core; human/JSON render;
config-file loading; `attest verify` / `attest schema`).

## WU7 — `@attest/cli` v1.0 (2026-06-05)

Complete rewrite of the CLI to v1.0. This is the seam where the five engine packages
come together and produce end-to-end verdicts against real repos.

- **`attest verify`** (`commands/verify.ts`): reads manifest via `createManifestValidator`,
  parses diff via `@attest/diff parseDiff` (`--diff` optional — omit to run `git diff HEAD`),
  loads `attest.config.json` if present, **runs `@attest/runner runOutcomes`** for any
  `outcome` claims (injects results into `verify`; runner errors degrade to unverifiable,
  never crash), then calls `@attest/core verify`. Exit code = `verdict.exit_code` (0 or 1).
  Error exits: 66 (NOINPUT), 65 (DATAERR), 70 (INTERNAL).
- **`attest schema [manifest|verdict]`** (`commands/schema.ts`): prints the JSON Schema
  from `@attest/schema`. SPEC §6.6 requirement.
- **Config loader** (`config.ts`): reads `attest.config.json` from repoRoot (snake_case
  keys `build_cmd`/`test_cmd`/`lint_cmd`/`allowlist_basenames`/`allowlist_dirs`/
  `test_globs_extra`); maps to `RunnerConfig` + `AttestConfig`. Missing file → both
  undefined so engine defaults apply. `attest.toml` support deferred to Phase 2.
- **Human renderer** (`render/human.ts`): header (version, task, agent), per-claim icon
  (`✓`/`✗`/`~`) + kind + detail + reason, undeclared section (flagged + suppressed
  counts), summary line, result line. Color is opt-in via TTY detection; `--no-color`
  always disables.
- **JSON renderer** (`render/json.ts`): `JSON.stringify(verdict, null, 2)` — the verdict
  object is the schema-conformant output, nothing added.
- **Removed `@attest/detectors-ts`** from CLI dependencies. The CLI no longer calls
  detector code. WU8 will demote `@attest/detectors-ts` into the opt-in plugin package.
- **Golden-path fixture** updated to v1.0 format: a `modify` diff on `src/auth.ts` adds
  `login` (claimed) and `_helper` (not claimed), giving exit 1 with one undeclared symbol.
  `expected-human.txt` and `expected.json` are generated from the live CLI output.
- **Tests (6):** golden-path human ✓, golden-path JSON ✓, exit-66 (NOINPUT) ✓, exit-65
  (DATAERR bad JSON) ✓, placeholder exit-0 contract ✓, scaffold ✓.
- Green in isolation: build ✓, typecheck ✓, 6 tests ✓, eslint ✓, prettier ✓.

**All 6 Phase-1 packages migrated and green: 146 tests total.**
**Still expected-red:** `@attest/detectors-ts` (v0.1 API) until WU8.

**Next:** WU8 — demote `@attest/detectors-ts` to opt-in plugin; WU9 — §6.7 acceptance gate.
