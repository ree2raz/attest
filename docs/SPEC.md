# attest — Engineering Specification

**Target:** v1.0 (public release)
**Status:** Design locked for Phase 1. Phases 2–4 specified at decreasing fidelity.
**Audience:** the maintainer, interactive Claude Code sessions, and autonomous routines.

> This file is the single source of truth. `CLAUDE.md` references it so every
> session and routine inherits it as ground truth. When a decision here conflicts
> with code, the code is wrong until this file is deliberately changed.

---

## 0. How to read this

Sections 1–5 are stable contracts (product, scope, data model, architecture).
Section 6 is the detailed, build-now spec. Sections 7–9 are forward specs that
will tighten as Phase 1 lands. Section 10 is the test strategy that gates every
phase. Section 11 is the implementation path using Claude Code.

The single most important rule in this document: **attest verifies structure and
outcomes, never behavior or semantics.** Every design choice descends from that.

---

## 1. Product definition

**One-liner:** attest is the deterministic verification layer for spec-driven and
agentic development. It confirms that a code change matches what the agent declared
it would do, catches changes the agent did not declare, and produces a
compliance-grade record of the result. No LLM in the verification path. No SaaS.

**Thesis.** AI coding agents report success in prose ("Done — added the login
endpoint and tests"). That report is not evidence. attest forces the agent to emit
a structured _manifest_ of what it changed, then independently checks every claim
against the actual diff and against real build/test outcomes, and flags anything
the agent changed but did not declare (scope drift). The output is a structured
verdict and an exportable provenance record.

**Positioning.** attest rides two proven waves rather than standing in an empty
quadrant:

1. **Outcome-based verification** (the SWE-bench / CI-gate pole): deterministic,
   language-agnostic, run-it-and-check-the-result.
2. **Spec-driven development** (spec-kit, Kiro, GSD): developers are voluntarily
   adopting "declare intent first." attest is the missing verifier at the end of
   that workflow — _did the diff match the spec?_

**Beachhead ICP.** Regulated teams shipping high-risk AI systems (EU AI Act
Annex III domains: finance, hiring, healthcare, critical infra) who need
design-level provenance for AI-generated code before the **August 2, 2026**
high-risk enforcement date. Broad-developer adoption is a follow-on, not the
launch target. Calibrate "success" to high-intent users and design partners, not
star counts.

**License:** Apache-2.0. **Distribution:** local CLI + CI integration. No cloud
dependency, ever.

---

## 2. Scope: goals and non-goals

### In scope (what attest does)

- Parse an agent-emitted manifest of declared changes.
- Verify each declared change against the actual diff (file-level and symbol-level,
  structurally).
- Detect undeclared changes (files and symbols changed but not declared).
- Verify declared outcomes (build passes, tests pass, lint passes) by execution.
- Emit a structured verdict and a provenance/audit record.
- Work across languages via tree-sitter (Phase 1: TypeScript/TSX, Python, Go).

### Explicitly NOT in scope (the pivot, made permanent)

- **No semantic correctness judgment.** attest does not decide whether the code is
  _correct_ or _good_. That is the job of LLM review tools (CodeRabbit, Greptile).
- **No behavioral/security property verification.** Claims like "authentication is
  enforced on every path," "input is validated," "no SQL injection" are
  **semantic** and return `unverifiable`, with a message pointing the user to
  semantic/LLM review. attest never tries to answer these with heuristics. (This is
  the Camp-3 trap that earlier killed the syntactic-detector approach — do not
  reintroduce it.)
- **No per-framework detectors as a core feature.** The legacy `detectors-ts`
  authentication detector is demoted to an optional, clearly-labeled best-effort
  plugin, out of the core thesis and out of CI gating.
- **No LLM anywhere in the verification path.** Determinism is the product.
- **No SaaS, no telemetry, no required network calls.**

If a proposed feature requires understanding _what the code means_, it is out of
scope by definition. Route it to the human or to an LLM tool; do not build it into
attest.

---

## 3. The verification model

attest runs exactly three verifier families. All three are deterministic and
language-agnostic.

1. **Declared-change verification** — for each claim in the manifest, confirm the
   claimed change is structurally present in the diff/post-change tree.
2. **Undeclared-change detection** — compute the set of things actually changed,
   subtract the set declared; anything left over is scope drift. (The "union trick.")
3. **Outcome verification** — execute the declared build/test/lint commands in an
   isolated checkout and confirm exit codes match the claims.

Verdict = the union of all three, plus an overall pass/fail and exit code.

---

## 4. Data model

All three artifacts live in `@attest/schema` as JSON Schema + generated TypeScript
types + an ajv validator. Schemas are versioned via `attest_version`.

### 4.1 Manifest (input — emitted by the agent)

```jsonc
{
  "attest_version": "1.0",
  "task": { "id": "T-142", "description": "Add login endpoint" },
  "agent": { "id": "claude-code", "model": "claude-opus-4-8", "tool_calls": 5 },
  "generated_at": "2026-05-31T19:04:00Z",

  // Everything the agent claims it touched. Drives undeclared-change detection.
  "declared_scope": {
    "files": ["src/routes/auth.ts", "tests/auth.test.ts"],
  },

  // Individual verifiable claims.
  "claims": [
    { "id": "c1", "kind": "file_change", "op": "modify", "path": "src/routes/auth.ts" },
    {
      "id": "c2",
      "kind": "symbol_added",
      "path": "src/routes/auth.ts",
      "symbol": "login",
      "symbol_kind": "function",
    },
    { "id": "c3", "kind": "test_added", "path": "tests/auth.test.ts", "covers": "login" },
    { "id": "c4", "kind": "outcome", "check": "tests_pass" },
    { "id": "c5", "kind": "outcome", "check": "build_passes" },
  ],
}
```

**Claim taxonomy (all structural — this list is closed for v1.0):**

| `kind`            | Fields                                        | Verified by        |
| ----------------- | --------------------------------------------- | ------------------ |
| `file_change`     | `op` (create/modify/delete), `path`           | diff parser        |
| `symbol_added`    | `path`, `symbol`, `symbol_kind`               | tree-sitter        |
| `symbol_removed`  | `path`, `symbol`, `symbol_kind`               | tree-sitter        |
| `symbol_modified` | `path`, `symbol`, `symbol_kind`               | tree-sitter        |
| `test_added`      | `path`, `covers?`                             | diff + tree-sitter |
| `test_modified`   | `path`, `covers?`                             | diff + tree-sitter |
| `outcome`         | `check` (build_passes/tests_pass/lint_passes) | runner             |

Any claim whose `kind` is not in this table → `unverifiable` with reason
`unsupported_claim_kind`. Any _semantic_ assertion smuggled into a `description`
field is ignored by the verifier (it is not a claim).

### 4.2 Verdict (output)

```jsonc
{
  "attest_version": "1.0",
  "task_id": "T-142",
  "result": "fail", // "pass" | "fail"
  "exit_code": 1, // 0 = all verified + zero undeclared; else 1
  "claims": [
    { "id": "c1", "status": "verified", "evidence": { "op": "modify", "hunks": 2 } },
    {
      "id": "c2",
      "status": "verified",
      "evidence": { "node_kind": "function_declaration", "line": 42 },
    },
    { "id": "c3", "status": "failed", "reason": "no change detected in tests/auth.test.ts" },
    {
      "id": "c4",
      "status": "verified",
      "evidence": { "cmd": "npm test", "exit_code": 0, "duration_ms": 8123 },
    },
    { "id": "c5", "status": "verified", "evidence": { "cmd": "npm run build", "exit_code": 0 } },
  ],
  "undeclared_changes": [
    { "path": "src/config/db.ts", "op": "modify", "granularity": "file", "severity": "flag" },
  ],
  "summary": { "claims_total": 5, "verified": 4, "failed": 1, "unverifiable": 0, "undeclared": 1 },
}
```

`status` ∈ `verified | failed | unverifiable`. The CLI renders this as the human
view (the v0.1 emoji output is fine); the JSON is the source of truth and the
input to the audit record.

### 4.3 Audit record (Phase 3 — provenance)

Append-only JSONL, one record per verification, designed to map onto EU AI Act
Article 12 logging fields. Minimum field set (confirm against primary Article
12/19 text before any pitch copy claims compliance):

```jsonc
{
  "record_id": "uuid",
  "timestamp": "2026-05-31T19:04:10Z",
  "invoking_user": "rituraj", // who ran the agent/verifier
  "governing_spec": { "source": "spec-kit", "ref": "tasks.md@a1b2c3" },
  "agent": { "id": "claude-code", "model": "claude-opus-4-8" },
  "input_context_hash": "sha256:...", // manifest hash, not raw content
  "output_artifact_hash": "sha256:...", // diff hash
  "verdict_digest": "sha256:...", // hash of §4.2 verdict
  "human_reviewer": null, // filled on review
  "disposition": "pending", // pending|accepted|rejected
}
```

No raw PII or source in the audit record — hashes only, matching the auditguard
pattern. Retention target ≥ 6 months (Article 19).

---

## 5. Architecture

Monorepo (pnpm), TypeScript. Reorganize from v0.1 as follows.

```
packages/
  schema/        @attest/schema    JSON Schema, TS types, ajv validator (manifest, verdict, audit)
  diff/          @attest/diff      unified diff -> structured file/hunk model
  symbols/       @attest/symbols   tree-sitter symbol extraction, language-agnostic   [NEW]
  core/          @attest/core      orchestration: load manifest, run 3 verifiers, assemble verdict
  runner/        @attest/runner    build/test/lint execution + worktree isolation     [NEW]
  audit/         @attest/audit     provenance record emission                          [Phase 3]
  cli/           @attest/cli       `attest verify`, `attest derive`, `attest audit`
  detectors-ts/  @attest/detectors-ts  DEMOTED: optional best-effort behavioral plugin, off by default
```

### 5.1 The tree-sitter decision (architectural linchpin)

Symbol verification uses **tree-sitter** parse trees, not per-language/per-framework
hand-written logic. `@attest/symbols` exposes one operation:

> Given a file's post-change source and a `symbol` + `symbol_kind`, return whether a
> declaration node of that kind with that name exists, and where.

Per language we vendor a grammar (TS/TSX, Python, Go in Phase 1) and a small
**node-kind map**: `symbol_kind` → the grammar's declaration node kinds
(e.g. `function` → `function_declaration | method_definition | arrow_function`
assigned to a name binding). Adding a language = vendor a grammar + write a
node-kind map. **No detector logic, ever.** This is what makes "language-agnostic
structural verification" real and what keeps attest out of the Camp-3 trap: it
answers _does this symbol exist and is it of this kind_, never _does this symbol
behave correctly_.

---

## 6. Phase 1 — Core verification engine (BUILD NOW, ~3 weeks of evenings)

**Goal / definition of done:** a stranger clones attest, points it at a real repo
in TypeScript, Python, _or_ Go, runs `attest verify`, and gets a correct verdict
that includes (a) per-claim structural verification, (b) undeclared-change
detection, and (c) real build/test outcomes — with no framework-specific code in
the path.

### 6.1 Inputs

`attest verify --manifest <path> --diff <path> --repo-root <path>`
plus a repo config file (`attest.toml` or `attest.config.json`) declaring runner
commands (see 6.4). `--diff` may be omitted to default to `git diff` of the working
tree against `HEAD`.

### 6.2 Declared-change verification

For each claim:

- **`file_change`** — parse the diff (`@attest/diff`). Confirm a hunk exists for
  `path` with the claimed `op`. `create` = file absent in base, present after;
  `delete` = inverse; `modify` = present both sides with hunks. Pure text/diff
  operation, language-agnostic. Status `verified` / `failed`.

- **`symbol_added|removed|modified`** — use `@attest/symbols`. Parse the relevant
  pre- and post-change file states (reconstruct from base + diff, or read from the
  worktree). Compute the symbol delta for that file at the requested `symbol_kind`.
  Confirm the named symbol appears in the added/removed/modified set as claimed.
  Status with evidence `{ node_kind, line }`.

- **`test_added|modified`** — structural only: (1) a diff hunk exists for a path
  that the repo's test-glob classifies as a test file, and (2) if `covers` is
  given, a tree-sitter test-symbol (e.g. `it`/`test`/`describe` call, `def test_*`,
  `func Test*`) referencing or adjacent to `covers` was added/changed. `covers` is
  a _structural reference check, not a coverage proof_ — do not claim it verifies
  the test actually exercises the symbol. If you cannot confirm structurally,
  return `unverifiable`, never a guess.

- **Behavioral / unknown kinds** — `unverifiable`, reason set, with a message
  pointing to LLM review. Never fall through to a heuristic.

### 6.3 Undeclared-change detection (the moat)

```
actual_files   = { paths with hunks in the diff }
declared_files = declared_scope.files  ∪  { path of every claim }
undeclared_files = actual_files \ declared_files  (minus the allowlist)
```

Plus **intra-file symbol drift**: for each declared file, compute actual
added/modified symbols (tree-sitter) and subtract those named in claims; leftovers
are undeclared symbol changes inside an otherwise-declared file. This is the
scope-drift case Gergely Orosz named ("the agent fixed something nearby and the
diff no longer corresponds to the intention").

**Allowlist** (config, with sane defaults) suppresses noise: lockfiles
(`package-lock.json`, `pnpm-lock.yaml`, `go.sum`, `poetry.lock`), generated dirs,
formatting-only hunks. Without this the detector is too noisy to trust — treat the
allowlist as a Phase-1 requirement, not a polish item. Each undeclared change gets
a `severity` (`flag` default; allowlisted = suppressed).

### 6.4 Outcome verification (runner)

`@attest/runner` executes declared `outcome` checks and compares exit codes.

- **Config** (`attest.toml`): `build_cmd`, `test_cmd`, `lint_cmd`. Auto-detect when
  absent (npm/pnpm scripts, `Makefile`, `pyproject`/`pytest`, `go build`/`go test`).
- **Isolation (Phase 1):** create a clean `git worktree` at the post-change state,
  run commands there, capture exit code + truncated (head/tail) logs + duration.
  **Do not run in the live working tree** — isolation is a correctness requirement.
- **Security note:** Phase 1 assumes the user runs attest on _their own_ change
  (locally or in their own CI), where they would run these tests anyway. Running
  _untrusted_ agent code under attest requires container isolation — deferred to
  Phase 3 (§8). Do not let this gap get silently closed by a "simpler" worktree-less
  implementation.

### 6.5 detectors-ts demotion

Move the v0.1 authentication detector and the `chain.ts`/`classify.ts` heuristics
into `@attest/detectors-ts` as an **opt-in plugin, disabled by default**, clearly
labeled "best-effort, non-deterministic across frameworks, not part of the core
verdict." It must not affect exit code or gate CI. Keep it (sunk work, occasional
signal); do not centre it. Do not invest further in per-framework coverage.

### 6.6 CLI surface (Phase 1)

- `attest verify --manifest --diff? --repo-root --format json|human`
  Exit 0 iff all claims `verified`/`unverifiable-but-allowed` AND zero undeclared
  (after allowlist). Else exit 1.
- `attest schema [manifest|verdict]` — print the JSON Schema.

### 6.7 Phase 1 acceptance criteria (the "done" gate — do not skip)

Phase 1 ships only when **all** hold:

1. `attest verify` produces a correct verdict on a real repo in **each** of TS,
   Python, Go (one fixture repo per language, in the test corpus §10).
2. Undeclared-change detection catches a planted scope-drift change (a file and an
   intra-file symbol the manifest did not declare) and suppresses an allowlisted one.
3. Outcome verification runs real build+test in worktree isolation and reports the
   true exit code (verified against a deliberately failing-test fixture).
4. A behavioral claim returns `unverifiable` with the LLM-review pointer — never a
   heuristic verdict.
5. The fixture corpus (honest / lying / partial / undeclared manifests) passes as
   the regression oracle; CI runs it on every commit.
6. detectors-ts is off by default and does not influence exit code.
7. `README` shows a 20-minute zero-to-first-verdict path on a real repo.

---

## 7. Phase 2 — Workflow integration + SDD derivation (~weeks 3–5)

**Goal:** attest drops into existing workflows with near-zero manual manifest
authoring.

- **GitHub Action** (highest leverage): fails the check when claims don't verify or
  undeclared changes exist. Enters teams' CI without workflow change.
- **Pre-commit hook** and **Claude Code hook**: run attest automatically when the
  agent reports completion.
- **`attest derive`** — the friction-killer. Where a spec-driven-development
  artifact already exists (spec-kit `tasks.md`, Kiro requirements/design/tasks,
  EARS acceptance criteria), derive the manifest from it instead of asking for a
  second declaration. This is the core Phase 2 differentiator: attest becomes the
  verification half of a movement already in motion. Start with spec-kit `tasks.md`
  (largest install base), then Kiro.
- **Acceptance:** a contributor adds attest to a repo's CI in one file; on an
  SDD repo, `attest derive` produces a usable manifest with no hand-authoring; the
  Action posts a clear pass/fail with the undeclared list.

---

## 8. Phase 3 — Audit trail / provenance (~weeks 5–6)

**Goal:** emit a regulator-presentable provenance record per verification.

- `@attest/audit` writes the §4.3 JSONL record, append-only, hashes-not-content.
- Field mapping to EU AI Act Article 12 (logging) and Article 19 (≥6-month
  retention). **Verify against primary statute text before any compliance claim in
  docs or pitch.**
- `attest audit export` — produce a signed, time-ordered bundle for a date range.
- **Container isolation** for the runner lands here (reproducible, sandboxed
  execution; SWE-bench-style pinned image), closing the §6.4 security gap for the
  untrusted-code case the regulated buyer cares about.
- **Positioning:** lead with verification, deliver it _in_ the audit format. "An
  agent touched this" is satisfiable by a git `Co-Authored-By` footer; your
  defensible position is "the agent claimed X, the verifier independently confirmed
  Y, here is the signed divergence record."
- **Acceptance:** every `verify` emits a valid audit record; `export` yields a
  bundle a non-technical reviewer can read; container-isolated runs are
  reproducible across machines.

---

## 9. Phase 4 — Launch (~weeks 6–8)

Not engineering; positioning and distribution.

- **Thesis essay** on rituraj.info: "Coding agents lie by omission — make them
  prove their work," with attest as the proof-of-concept and the SDD-verifier framing.
- **60-second demo:** an agent claims "done," attest catches an undeclared change
  and a failed test claim live.
- **Channels (not HN):** r/LocalLLaMA, r/ExperiencedDevs, the Claude Code / Aider /
  spec-kit communities, a build-in-public X thread. One known voice in the
  AI-coding-tools space trying it beats any volume of posting.
- **Beachhead message** for the regulated ICP: design-level provenance for
  AI-generated code ahead of the Aug 2 2026 high-risk deadline, audit trail inside
  your perimeter (no vendor-hosted logs).
- **Success = high-intent users / design partners, not raw stars.**

---

## 10. Cross-cutting: test strategy (the oracle)

The fixture corpus is the backbone and should be built first (it's also ideal
overnight-routine work). For each supported language, a small real repo plus a set
of (manifest, diff) pairs spanning:

- **Honest** — every claim true, nothing undeclared → expect `pass`.
- **Lying** — a claim asserts a symbol/file/test that isn't in the diff → `failed`.
- **Partial** — some claims true, some false → mixed verdict, exit 1.
- **Undeclared** — diff changes a file/symbol the manifest didn't declare → flagged.
- **Allowlisted** — only a lockfile changed beyond scope → suppressed, `pass`.
- **Outcome-fail** — claims `tests_pass` but a test fails → `failed` via runner.
- **Behavioral** — a semantic claim → `unverifiable` + pointer, never a guess.

Every phase regresses against this corpus in CI. A change that breaks an oracle
case is wrong by definition.

---

## 11. Implementation path with Claude Code

You have a full-time job (in this domain), ~2 evening hours, and Claude Code with
routines (autonomous, cloud, output to a `claude/`-prefixed branch for review;
no mid-run human step). The method below splits work by _what needs your judgment_
vs _what is mechanical against a clear spec_.

### 11.1 Set up the context once

- This file lives at `docs/SPEC.md` (done).
- `CLAUDE.md` at repo root points to `docs/SPEC.md` as authoritative, states the
  non-goals (§2) explicitly (so neither a session nor a routine reintroduces
  semantic detectors), and names the fixture corpus as the regression oracle.
- Add a few slash commands / saved prompts for the repeated loops (e.g.
  "implement package X against its sub-spec and the corpus, open a PR").

### 11.2 The division of labor (the core rule)

- **Routines (overnight, mechanical, well-bounded):** scaffolding, tree-sitter
  grammar wiring + node-kind maps, the fixture corpus, first-draft implementations
  of a _fully specified_ package against existing tests, doc generation, dependency
  bumps. Output is a branch/PR you review at breakfast.
- **Interactive sessions (your 2 evening hours, judgment-heavy):** every design
  decision, the symbol-delta and undeclared-detection logic, the runner isolation,
  the audit format, and **reviewing/merging every routine PR**. Routines draft;
  you decide. Never merge a routine PR unread — the worktree-isolation and
  no-semantic-fallthrough invariants are exactly what an autonomous agent will
  "helpfully" weaken.

### 11.3 Build order (bottom-up; each step gated by the corpus)

1. **`@attest/schema`** — lock manifest/verdict schemas (§4.1–4.2). _Interactive_
   (these are contracts). Routine can generate types + validator after you lock them.
2. **Fixture corpus** (§10) — _routine_ generates first drafts overnight; you curate.
   Build this early; it's the oracle for everything after.
3. **`@attest/diff`** — unified-diff parser. _Routine_ drafts against corpus diffs;
   you review edge cases (renames, binary, mode changes).
4. **`@attest/symbols`** — tree-sitter wiring + node-kind maps for TS/Python/Go.
   Grammar wiring is _routine_; the node-kind maps and the "exists/kind only, never
   behavior" boundary are _interactive_.
5. **`@attest/core`** — orchestration + the three verifiers + undeclared detection.
   This is the heart and the most judgment-heavy. _Interactive_, with routines
   filling in well-specified sub-functions.
6. **`@attest/runner`** — worktree isolation + command execution. _Interactive_
   (isolation correctness matters); routine can draft the auto-detect table.
7. **`@attest/cli`** — wire it together, human + JSON output. Mostly _routine_,
   you review UX.
8. Run the full corpus; hit the §6.7 acceptance gate; only then ship Phase 1.

### 11.4 Routine cadence given run caps

Run caps are per-day and tier-based. Spend them on the highest-value overnight
unit, not many small triggers. A good nightly pattern: one routine that picks up
the next "implement package X against its sub-spec + corpus, open a PR" task; you
review and merge in the morning, queue the next. Keep a short `docs/BUILD_LOG.md`
the routine appends to, so each night's run has continuity.

### 11.5 Discipline guardrails (your known failure mode)

- **Do not start Phase 2 until §6.7 passes.** Finishing the gate is the point.
- **Do not let any routine reintroduce semantic detectors** — `CLAUDE.md` must
  forbid it and you must catch it in review.
- **One tool to done before the eval harness.** attest reaches public v1.0 first;
  the eval harness is the second instance of the same primitive, reusing
  `@attest/audit`. Resist building both at once.
