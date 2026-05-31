# attest — Project Specification v0.1

Status: **Ready for implementation.**
Audience: Coding agents (Claude Code, OpenCode, Hermes, or equivalents) building v0.1.
Companion specs: `SCHEMA_V0.1.md`, `DETECTOR_AUTHENTICATION_SPEC.md`, `CLI_V01_SPEC.md`.

---

## 1. Name and namespace

**Name**: `attest`

**Rationale**: The agent attests to its changes via structured claims; `attest` verifies those attestations against the actual diff. Short, one syllable, semantic precision, and rides the existing "attestation" idiom in software supply-chain security (SLSA, in-toto, sigstore) without conflicting with it — different layer of the stack.

**Namespace availability check (MANDATORY before first commit)**:

- npm: `attest` as an org scope (`@attest/*`)
- GitHub: `github.com/attest`
- Fallback if taken: `attestly` (org scope `@attestly/*`, `github.com/attestly`)

If the primary name is unavailable, apply the fallback globally. Do not mix.

---

## 2. Mission (one paragraph)

`attest` closes the gap between what an AI coding agent claims it did and what it actually did. The agent declares structured claims; `attest` verifies each claim deterministically against the diff; a human reviewer reads one report that tells them exactly where to focus. No LLM judgment in the verification path. No SaaS dependency. Open source, Apache-2.0, locally runnable.

---

## 3. Philosophy (non-negotiable)

1. **Deterministic checks only.** The verifier does not call an LLM to decide whether a claim matches a diff. Every verdict is reproducible from the same inputs.
2. **Silence-by-omission is the adversary.** Undeclared modifications are surfaced as loudly as failed claims. Zero tolerance.
3. **The schema is the product.** Agents learn to emit this vocabulary; reviewers learn to read in it. Schema stability is more important than feature count.
4. **Fail loud, fail specific.** Every rejection returns a structured reason code the agent can act on.
5. **No hidden state.** No databases in v0.1. Input in, verdict out, process exits. Stateless CLI.

---

## 4. v0.1 Scope

### IN (must ship)

1. `@attest/schema` — JSON Schema + TypeScript types for the manifest defined in `SCHEMA_V0.1.md`
2. `@attest/core` — verifier orchestration, verdict engine, undeclared-changes detector, diff parser
3. `@attest/detectors-ts` — TypeScript-language detectors (authentication only in v0.1)
4. `@attest/cli` — command-line tool: manifest + diff in, verdict out
5. Fixture suite for the authentication detector (≥17 fixtures, specified in `DETECTOR_AUTHENTICATION_SPEC.md` §7)
6. README, CONTRIBUTING, LICENSE (Apache-2.0), CI workflow

### OUT (deferred, do not build)

- MCP (Model Context Protocol) server (v0.2)
- GitHub App / PR comment renderer (v0.3)
- Nine remaining behavioral detectors (`input_validation`, `error_handling`, etc.) — v0.2+
- Python-language detectors — v0.2+
- Test execution (we check test _presence_, never _behavior_)
- Pre-declaration / TDD-style flow — v0.2+
- Multi-session provenance chaining — v0.2+
- Published npm packages — v0.2+ (v0.1 is repo-local usable via `pnpm build && pnpm link`)
- Any form of LLM inference in the verifier

**Rationale for narrow scope**: v0.1 must prove the core loop — structured claim in, deterministic verdict out — works end to end on one behavior. The detector is the hardest and most novel piece. If authentication detection is crisp and the CLI produces the mockup from `SCHEMA_V0.1.md` §11, the thesis is proven and everything else is adapters + repetition.

---

## 5. Technology stack (locked)

These decisions are final for v0.1. Do not introduce alternatives without a spec revision.

| Concern            | Choice                          | Rationale                                                 |
| ------------------ | ------------------------------- | --------------------------------------------------------- |
| Language           | TypeScript 5.4+                 | Target language, native                                   |
| Module system      | ESM only                        | Modern, forward-compatible                                |
| Runtime            | Node.js 20 LTS or newer         | Maintained LTS, native ESM, fetch, test runner available  |
| Package manager    | pnpm 9+                         | Fast, first-class workspaces, strict dependency isolation |
| AST library        | `ts-morph`                      | Object-oriented API over TS compiler; agent-friendly      |
| JSON Schema        | `ajv` + `ajv-formats`           | Fastest, most widely adopted                              |
| Diff parsing       | `parse-diff`                    | Battle-tested unified-diff parser                         |
| Test framework     | `vitest`                        | Fast, TS-native, ESM-native                               |
| Linter             | `eslint` + `@typescript-eslint` | Standard                                                  |
| Formatter          | `prettier`                      | Standard                                                  |
| CLI framework      | `clipanion`                     | Typed, class-based, validates args at compile time        |
| Build (libraries)  | `tsc`                           | Canonical                                                 |
| Build (CLI bin)    | `tsup`                          | Single-file bundle for `#!/usr/bin/env node` entrypoint   |
| Release management | `changesets`                    | Semver discipline from day one                            |
| CI                 | GitHub Actions                  | Free, standard                                            |
| Coverage           | `@vitest/coverage-v8`           | vitest coverage provider; required for ≥85% gate          |

No other dependencies may be added without explicit spec revision. If the agent believes a dependency is required, it must stop and ask — not silently introduce.

TypeScript compiler settings: `strict: true`, `noImplicitAny: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `moduleResolution: "bundler"`, `target: "ES2022"`.

---

## 6. Monorepo layout

```
attest/
├── packages/
│   ├── schema/
│   │   ├── src/
│   │   │   ├── index.ts            # re-exports
│   │   │   ├── manifest.schema.json
│   │   │   ├── types.ts            # TS types mirroring the schema
│   │   │   └── validator.ts        # ajv-based validator factory
│   │   ├── test/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── core/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── verifier.ts         # orchestration
│   │   │   ├── undeclared.ts       # undeclared-changes detector
│   │   │   ├── diff.ts             # unified diff → structured change set
│   │   │   ├── verdict.ts          # verdict types and constructors
│   │   │   ├── locate-route.ts     # locateRoute() + detectFramework() — shared util
│   │   │   └── checks/
│   │   │       ├── symbol-exists.ts
│   │   │       ├── removed.ts
│   │   │       ├── test-covers.ts
│   │   │       ├── signature-matches.ts
│   │   │       └── cannot-verify.ts
│   │   ├── test/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── detectors-ts/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── detector.ts         # Detector interface + registry
│   │   │   └── authentication/
│   │   │       ├── index.ts
│   │   │       ├── express.ts      # framework-specific modules
│   │   │       ├── fastify.ts
│   │   │       ├── nestjs.ts
│   │   │       ├── koa.ts
│   │   │       ├── raw-node.ts
│   │   │       ├── heuristics.ts   # name/import/body classifier
│   │   │       └── types.ts
│   │   ├── test/
│   │   ├── fixtures/
│   │   │   └── authentication/
│   │   │       ├── express-route-level-valid.ts
│   │   │       ├── express-route-level-valid.expected.json
│   │   │       ├── express-no-auth.ts
│   │   │       ├── express-no-auth.expected.json
│   │   │       └── ...             # full catalog per §7 of detector spec
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── cli/
│       ├── src/
│       │   ├── index.ts            # bin entrypoint
│       │   ├── commands/
│       │   │   └── verify.ts
│       │   ├── render/
│       │   │   ├── human.ts
│       │   │   └── json.ts
│       │   └── exit-codes.ts
│       ├── test/
│       ├── package.json
│       └── tsconfig.json
├── docs/
│   ├── SCHEMA_V0.1.md              # already exists
│   ├── PROJECT_SPEC.md             # this file
│   ├── DETECTOR_AUTHENTICATION_SPEC.md
│   ├── CLI_V01_SPEC.md
│   └── ARCHITECTURE.md             # derived from this spec, for humans
├── .github/
│   └── workflows/
│       └── ci.yml
├── .changeset/
├── package.json                    # root workspace manifest
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .eslintrc.cjs
├── .prettierrc
├── README.md
├── CONTRIBUTING.md
└── LICENSE                         # Apache-2.0
```

---

## 7. Package dependency graph

```
schema         → (no internal deps)
core           → schema
detectors-ts   → core, schema
cli            → schema, core, detectors-ts
```

No circular dependencies. No package imports a sibling's internal module — only its public `index.ts` exports.

---

## 8. Public interface contracts

These TypeScript types define the boundaries between packages. Specification only — agent writes the declarations and implementations.

### 8.1 `@attest/schema`

```ts
// The manifest shape — mirrors the JSON Schema in §3 of SCHEMA_V0.1.md
export type SchemaVersion = "0.1";
export type AgentId = "claude-code" | "codex" | "cursor" | "opencode" | "other";
export type TaskSource = "user_prompt" | "issue_reference" | "continuation";
export type ClaimType =
  | "add_symbol"
  | "remove_symbol"
  | "modify_signature"
  | "modify_behavior"
  | "add_test"
  | "refactor"
  | "add_dependency"
  | "remove_dependency"
  | "config_change";
export type CheckKind =
  | "symbol_exists"
  | "behavior_present"
  | "test_covers"
  | "signature_matches"
  | "removed"
  | "cannot_verify";
export type BehavioralProperty =
  | "null_check"
  | "input_validation"
  | "error_handling"
  | "authentication"
  | "authorization"
  | "rate_limiting"
  | "logging"
  | "sanitization"
  | "timeout"
  | "retry_logic"
  | "cannot_express";
export type TargetKind =
  | "function"
  | "class"
  | "type"
  | "endpoint"
  | "file"
  | "module"
  | "config_key"
  | "package";

export interface Target {
  kind: TargetKind;
  path: string;
  symbol?: string;
}
export interface VerificationContract {
  check: CheckKind;
  params?: Record<string, unknown>;
}
export interface Claim {
  id: string;
  type: ClaimType;
  target: Target;
  description: string;
  verification_contract: VerificationContract;
}
export interface Session {
  /* mirror SCHEMA_V0.1.md §2 */
}
export interface Task {
  summary: string;
  source: TaskSource;
}
export interface Manifest {
  schema_version: SchemaVersion;
  session: Session;
  task: Task;
  claims: Claim[];
}

// Validator
export interface ValidationError {
  path: string;
  code: string;
  message: string;
}
export interface Validator {
  validate(
    input: unknown,
  ): { ok: true; manifest: Manifest } | { ok: false; errors: ValidationError[] };
}
export function createValidator(): Validator;
```

### 8.2 `@attest/core`

```ts
import type { Manifest, Claim } from "@attest/schema";

export type Verdict = "verified" | "unverified" | "partial" | "unverifiable";

// Core-level reason codes — emitted by verifier routing, not by detectors.
// Detector-level reason codes are enumerated in DETECTOR_AUTHENTICATION_SPEC.md §10.
export type CoreReasonCode =
  | "detector_not_implemented" // behavior_present claim; no detector registered for that property
  | "unsupported_check"; // check kind not yet implemented or incompatible with target kind

export interface Evidence {
  kind: string;
  path?: string;
  symbol?: string;
  note?: string;
}

export interface ClaimResult {
  claim_id: string;
  verdict: Verdict;
  reason_code?: string; // CoreReasonCode or a detector reason code
  evidence: Evidence[];
}

export interface UndeclaredFinding {
  type: "file" | "symbol";
  path: string;
  symbol?: string;
}

export interface VerdictReport {
  manifest_hash: string;
  summary: {
    total_claims: number;
    verified: number;
    unverified: number;
    partial: number;
    unverifiable: number;
    undeclared_files: number;
    undeclared_symbols: number;
  };
  claims: ClaimResult[];
  undeclared: UndeclaredFinding[];
  reviewer_focus: Array<{ claim_id?: string; undeclared?: UndeclaredFinding; reason: string }>;
}

export interface DiffChange {
  path: string;
  kind: "added" | "modified" | "deleted";
  post_content?: string;
  hunks: unknown[];
}
export interface DiffSet {
  changes: DiffChange[];
}

export interface VerifyInput {
  manifest: Manifest;
  manifestRawBytes: Uint8Array; // raw bytes of the manifest file; core computes manifest_hash from this
  diff: DiffSet;
  repoRoot: string;
}

export function verify(input: VerifyInput): Promise<VerdictReport>;
```

### 8.3 `@attest/detectors-ts`

```ts
import type { Claim, Target } from "@attest/schema";
import type { Evidence, Verdict } from "@attest/core";

export interface DetectorContext {
  repoRoot: string;
  postDiffFile: (path: string) => Promise<string | null>; // post-diff content or null if deleted
}

export interface DetectorVerdict {
  verdict: Verdict;
  reason_code?: string;
  evidence: Evidence[];
}

export interface Detector {
  id: string; // e.g. "ts.behavior.authentication"
  canHandle(claim: Claim): boolean; // routing gate
  run(claim: Claim, ctx: DetectorContext): Promise<DetectorVerdict>;
}

export function registerDetectors(): Detector[];
```

### 8.4 `@attest/cli`

```ts
// clipanion command definition; no runtime types exported to consumers.
// The CLI is a binary, not a library.
```

---

## 9. Diff format expected by v0.1

The CLI accepts **unified diff** format (the output of `git diff` or `git format-patch` single-commit). v0.1 does not read git history directly; the diff is passed as a file or stdin.

**Expected invariants**:

- Paths in the diff are relative to `--repo-root`.
- Only textual files are handled. Binary files in the diff are ignored with a warning.
- Post-diff content is resolved by **reading the file from disk at `repoRoot/path`** — the working tree is assumed to be in post-diff state when `attest verify` runs. The diff is used only to enumerate changed files and determine change kind (`added | modified | deleted`); it is never applied programmatically to reconstruct content. A deleted file (absent from disk) causes content-dependent checks to return `unverifiable`. See `CORE_CHECKS_SPEC.md §6` for the full resolution rules.

**Out of scope**: reading `.git/` directly, multi-commit ranges, renames (for v0.1, rename + modification is treated as delete+add).

---

## 10. Quality gates — definition of "v0.1 ready"

Every item below must be green before v0.1 is considered shipped.

- [ ] Repository structure matches §6 exactly
- [ ] All package dependencies match §7; no extras
- [ ] All stack choices in §5 are respected; no extras
- [ ] `@attest/schema` validates the example manifest from `SCHEMA_V0.1.md` §10 (positive test)
- [ ] `@attest/schema` rejects hard-fail rules 1, 3, and 4 from `SCHEMA_V0.1.md` §9 (three negative tests in `packages/schema/test/validator.negative.test.ts`)
- [ ] `@attest/core` rejects hard-fail rules 2 and 5 from `SCHEMA_V0.1.md` §9 (two negative tests in `packages/core/test/verifier.test.ts`; these require diff + repo context not available to the schema package)
- [ ] Every fixture in `DETECTOR_AUTHENTICATION_SPEC.md` §7 passes (matches expected verdict exactly)
- [ ] CLI golden-path test (`CLI_V01_SPEC.md` §7) passes: given the specified manifest + diff, produces the specified output, exits with code 1
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 with all tests green
- [ ] `pnpm build` produces dist/ artifacts in every package
- [ ] README.md covers: what it is, install, basic `attest verify` example, link to SCHEMA_V0.1.md
- [ ] CONTRIBUTING.md covers: how to add a detector, how to add a fixture, commit conventions
- [ ] LICENSE is Apache-2.0
- [ ] CI workflow runs `pnpm lint && pnpm test && pnpm build` on every push and PR

---

## 11. Testing strategy

1. **Schema tests** (`packages/schema/test/`):
   - `validator.positive.test.ts` — valid manifest accepted
   - `validator.negative.test.ts` — three rejection cases: hard-fail rules 1, 3, and 4 (JSON-Schema-enforceable; rules 2 and 5 require diff + repo context and are tested in core)
2. **Core tests** (`packages/core/test/`):
   - `undeclared.test.ts` — set-subtraction behavior on files and symbols
   - `verifier.test.ts` — orchestration: correct detector routing, correct aggregation
3. **Detector tests** (`packages/detectors-ts/test/`):
   - `authentication.fixtures.test.ts` — drives the fixture catalog. For each `*.ts` fixture in `fixtures/authentication/`, runs the detector and asserts the verdict matches the companion `*.expected.json`
4. **CLI tests** (`packages/cli/test/`):
   - `verify.e2e.test.ts` — the golden-path test

**Fixture convention**: every fixture file `X.ts` has a companion `X.expected.json` containing `{ verdict, reason_code?, evidence_contains?: string[] }`. The test asserts verdict equality and that every string in `evidence_contains` appears in at least one evidence entry's `note`.

---

## 12. Repository hygiene

- Commit discipline: one logical change per commit. No "WIP" merged to main.
- Semver: breaking change to `@attest/schema` = major version bump. All downstream packages follow.
- Changesets required for any user-facing change.
- Every new detector or behavior ships as a dedicated PR with its own fixture suite.
- `main` protected: CI must pass; at least one review required (once the repo has collaborators).

---

## 13. Non-goals (hard boundaries)

- Not a general-purpose PR reviewer. Do one thing.
- Not a security scanner. Defer to CodeQL, Semgrep, Snyk, Dependabot.
- Not a coverage tool. Defer to c8, istanbul, Codecov.
- Not a style enforcer. Defer to eslint, prettier.
- Not a hosted service. No backend, no auth, no accounts.
- Not a replacement for human review. The output is a _focus directive_, not an approval signal.

---

## 14. Versioning and schema evolution

`schema_version` is the sole gate for manifest compatibility. The verifier rejects manifests with unrecognized versions.

v0.1 freezes the schema shape defined in `SCHEMA_V0.1.md`. Any field addition or removal triggers a new schema version. The `@attest/schema` package exports the schema version as a constant.

---

## 15. What the agent should do when ambiguity arises

1. Re-read the relevant spec section.
2. If still ambiguous, STOP. Do not guess.
3. Surface the ambiguity to the user under "Open Questions" before proceeding.
4. Choose the most conservative interpretation (the one that rejects more inputs, constrains more behavior, narrows scope) and proceed, flagging the choice to the user.

The single worst failure mode is the agent silently making design decisions. The second worst is stalling. Conservative-and-documented beats both.
