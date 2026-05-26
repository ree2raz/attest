# Core Verification Checks — v0.1

Status: **Ready for implementation.**
Package: `@attest/core`
Module: `src/checks/`
Companion: `PROJECT_SPEC.md`, `SCHEMA_V0.1.md`, `DETECTOR_AUTHENTICATION_SPEC.md`

---

## 1. Purpose

`@attest/core` implements all verification checks **except** `behavior_present` (which is delegated to registered detectors). This document specifies:

- Core-level reason codes
- The five non-`behavior_present` check algorithms
- The `locateRoute()` shared utility
- The undeclared-changes detection algorithm (file-level and symbol-level)
- Post-diff content resolution rules
- `VerifyInput.manifestRawBytes` and hash computation

Anything not covered here defers to `DETECTOR_AUTHENTICATION_SPEC.md` for the authentication detector, and to `PROJECT_SPEC.md §8` for types.

---

## 2. Core-level reason codes

These are emitted by the verifier's routing/orchestration layer, not by detectors. They extend `@attest/core`'s public exports alongside `Verdict`.

```ts
export type CoreReasonCode =
  | "detector_not_implemented"   // behavior_present claim; no detector registered for that property
  | "unsupported_check";         // check kind not yet implemented in v0.1
```

**`detector_not_implemented`** — when a `behavior_present` claim arrives for a property with no registered detector (e.g., `rate_limiting` in v0.1), the verifier returns `unverifiable` with this code. This is not an error; it is the designed-in answer for v0.1-unimplemented properties.

**`unsupported_check`** — used when a check kind runs against an incompatible target kind (e.g., `signature_matches` on a `file` target), or when a parse error prevents the check from running.

These codes are **not** valid in detector output. The separation is enforced by package boundary: detectors return `DetectorVerdict` (reason codes enumerated in `DETECTOR_AUTHENTICATION_SPEC.md §10`); core produces `ClaimResult` (reason codes from either set, depending on routing path).

---

## 3. Check implementations

All checks in this section live in `@attest/core/src/checks/`. They are internal to core and are not exported from `@attest/core/src/index.ts`.

### 3.1 `cannot_verify`

No-op. Always returns `{ verdict: "unverifiable", evidence: [] }`. No reason code. Used for claims of type `refactor` and for `verification_contract.check: "cannot_verify"`.

### 3.2 `symbol_exists`

Parses the post-diff content of `target.path` using ts-morph (syntactic parse, no TypeChecker). Resolves presence by `target.kind`:

| `target.kind` | Located by |
|---|---|
| `function` | Top-level function declaration OR `const`/`let` variable declaration where the initializer is an arrow function or function expression, named `target.symbol` |
| `class` | Top-level class declaration named `target.symbol` |
| `type` | Top-level type alias (`type X = ...`) or interface (`interface X { ... }`) named `target.symbol` |
| `endpoint` | Route registration matching `target.symbol` via `locateRoute()` (§5) |
| `file` | File present in diff OR on disk at `repoRoot/target.path` |
| `module` | Same as `file` |
| `package` | Package key present in `dependencies` or `devDependencies` of `target.path` (must be a `package.json`) |
| `config_key` | Key path `target.symbol` (dot-separated) present in the target config file, parsed as JSON or treated as line-by-line key scan for non-JSON files |

**Evidence on pass**: `{ kind: "symbol", path, symbol, note: "<kind> declaration found" }`

**Evidence on fail**: `{ kind: "symbol", path, symbol, note: "<kind> declaration not found in post-diff content" }`

**Verdicts**:
- Symbol found → `verified`
- Symbol not found → `unverified` (no reason code; the check ran and failed cleanly)
- Parse error or incompatible target kind → `unverifiable` with `reason_code: "unsupported_check"` and a descriptive note

### 3.3 `removed`

Mirror of `symbol_exists`. Uses the same per-kind lookup logic.

- Symbol/file **absent** → `verified`
- Symbol/file **present** → `unverified` (no reason code)
- Parse error → `unverifiable` / `unsupported_check`

### 3.4 `test_covers`

`verification_contract.params.subject_symbol` is required; if absent, return `unverifiable` / `unsupported_check`.

Parses `target.path` syntactically and returns `verified` if **any** of:

1. An `import` declaration names `subject_symbol` as a named import, default import, or namespace import.
2. A string literal inside a `describe`, `it`, `test`, or `suite` call contains `subject_symbol` as a substring.
3. A `new` expression or call expression directly references an identifier named `subject_symbol`.

Returns `unverified` if none match.

**Evidence on pass**: `{ kind: "test", path, symbol: subject_symbol, note: "<N> reference(s) found" }`

**Evidence on fail**: `{ kind: "test", path, symbol: subject_symbol, note: "no references to subject_symbol found" }`

### 3.5 `signature_matches`

`verification_contract.params.expected` is required (string). If absent, return `unverifiable` / `unsupported_check`.

Only valid for `target.kind` of `function`, `class`, or `type`. Any other kind → `unverifiable` / `unsupported_check`.

Algorithm:

1. Locate the declaration using the same lookup as `symbol_exists`.
2. For `function`: extract the parameter list and return type annotation as a string by printing the relevant AST nodes.
3. Normalize both the extracted string and `params.expected`: collapse all whitespace runs to a single space, trim leading/trailing whitespace.
4. Compare normalized strings.

**Evidence on pass**: `{ kind: "symbol", path, symbol, note: "signature matches" }`

**Evidence on fail**: `{ kind: "symbol", path, symbol, note: "expected: <params.expected> — found: <extracted>" }`

---

## 4. Undeclared-changes detection

### 4.1 File-level undeclared

```
declared_files   = { claim.target.path | claim ∈ manifest.claims }
diff_paths       = { change.path | change ∈ diffSet.changes }
touched_files    = { path | path ∈ manifest.session.files_touched }

undeclared_files = (diff_paths ∪ touched_files) − declared_files
```

Using the **union** of `diff_paths` and `touched_files` closes the omission vector: a file that appears in the diff but is absent from `files_touched` is still flagged. A file in `files_touched` but absent from the diff generates no finding (agent listed a file it ultimately did not change — not a concern).

Each undeclared file produces an `UndeclaredFinding` with `type: "file"`.

### 4.2 Symbol-level undeclared

For each file in `(declared_files ∩ diff_paths)` — files that are both declared in some claim AND present in the diff:

1. Parse post-diff content with ts-morph (syntactic, no TypeChecker).
2. Extract **top-level declaration names**: function declarations, class declarations, `const`/`let`/`var` declarations at module scope (top-level, not inside blocks), type aliases, interfaces, exported enums. Do not descend into function bodies.
3. Build the **covered symbol set** for this file: union of `claim.target.symbol` across all claims whose `claim.target.path` equals this file. For claims with `target.kind: "endpoint"`, also attempt a best-effort lookup of the handler function name (the last identifier argument in the route registration call) and add it to the covered set — a failed lookup is silently ignored.
4. `undeclared_symbols = top_level_names − covered_symbol_set`

Each undeclared symbol produces an `UndeclaredFinding` with `type: "symbol"`.

**Non-TS files**: skip symbol-level detection entirely. A file-level finding is still emitted if the file is in `undeclared_files`.

### 4.3 Reviewer focus construction

After assembling `ClaimResult[]` and `UndeclaredFinding[]`:

1. Add one `reviewer_focus` entry for each `ClaimResult` whose `verdict` is `unverified` or `partial`, in manifest claim-id order.
2. Add one `reviewer_focus` entry for each `UndeclaredFinding`, sorted lexicographically by `path` then `symbol` (nulls last).
3. `unverifiable` claims do **not** produce reviewer focus entries — they are noise-free by design.

**Reason string templates** (used verbatim in both human and JSON output):

| Condition | `reason` template |
|---|---|
| `behavior_present` claim, `unverified` or `partial` | `"<claim_id> failed — <params.property humanized> not detected"` |
| Other check kind, `unverified` | `"<claim_id> — <reason_code humanized>"` |
| Other check kind, `unverified`, no reason code | `"<claim_id> — <check kind humanized> failed"` |
| Undeclared symbol | `"undeclared change to \`<symbol>\`"` |
| Undeclared file | `"undeclared file <path>"` |

**Humanization rule**: replace underscores with spaces. Examples: `authentication` → `"authentication"`, `rate_limiting` → `"rate limiting"`, `no_auth_in_chain` → `"no auth in chain"`.

---

## 5. `locateRoute()` — shared route-location utility

Exported from `@attest/core` for use by both core's `symbol_exists` check (endpoint kind) and the `@attest/detectors-ts` authentication detector.

```ts
import type { SourceFile, Node } from "ts-morph";

export type KnownFramework = "express" | "fastify" | "nestjs" | "koa" | "raw-node";

export interface RouteLocation {
  framework: KnownFramework;
  registrationNode: Node;   // the CallExpression or MethodDeclaration anchoring the route
}

export function detectFramework(sourceFile: SourceFile): KnownFramework | null;

export function locateRoute(
  sourceFile: SourceFile,
  symbol: string            // "METHOD /path" or "ClassName.methodName"
): RouteLocation | null;
```

**Framework detection** follows `DETECTOR_AUTHENTICATION_SPEC.md §4.1` exactly (import-scan, first-match wins). `detectFramework` returns `null` if no recognized import is found.

**Target registration** follows `DETECTOR_AUTHENTICATION_SPEC.md §4.2` exactly, per framework. Returns `null` if the symbol is not found.

The authentication detector's framework modules (`express.ts`, `fastify.ts`, etc.) import `locateRoute` and `detectFramework` from `@attest/core` rather than re-implementing them. This is the only approved cross-package dependency beyond what `PROJECT_SPEC.md §7` already lists.

---

## 6. Post-diff content resolution

**Invariant**: at the time `verify()` runs, the working tree at `repoRoot` reflects post-diff state. The CLI is designed to be run after `git apply` or from a checkout that is already in the post-merge state.

**Resolution rules** (in order):

1. **File present on disk** at `repoRoot/path` → read from disk. This is the post-diff content.
2. **File absent from disk** (deleted in the diff) → `postDiffFile()` returns `null`. Checks requiring content return `unverifiable` with `reason_code: "unsupported_check"` and `note: "file deleted; cannot inspect post-diff content"`.
3. **Binary file** (flagged by `parse-diff` as binary) → skip all content-based checks; return `unverifiable` with a note. Emit a stderr warning: `warn: binary file skipped: <path>`.

The diff is used **only** for:
- Enumerating changed files (for undeclared detection)
- Determining change kind: `added | modified | deleted`

The diff is **not** applied programmatically. `parse-diff` is used for structure only. No patch-apply utility is needed.

---

## 7. `VerifyInput` — manifest hash

```ts
export interface VerifyInput {
  manifest: Manifest;
  manifestRawBytes: Uint8Array;   // raw bytes of manifest file as read from disk by CLI
  diff: DiffSet;
  repoRoot: string;
}
```

Core computes `manifest_hash` internally:

```ts
import { createHash } from "node:crypto";

const hash = createHash("sha256").update(manifestRawBytes).digest("hex");
const manifestHash = `sha256:${hash}`;
```

The CLI reads the manifest file once with `fs.readFile` (returns a `Buffer`, assignable to `Uint8Array`), passes both the parsed `Manifest` and the raw buffer in `VerifyInput`. Core never touches the filesystem for the manifest — the CLI owns I/O; core owns computation.

---

## 8. Module layout within `@attest/core`

```
packages/core/src/
├── index.ts              # re-exports: verify, locateRoute, detectFramework, CoreReasonCode, all types
├── verifier.ts           # verify() orchestration — routes claims to checks or detectors
├── checks/
│   ├── symbol-exists.ts
│   ├── removed.ts
│   ├── test-covers.ts
│   ├── signature-matches.ts
│   └── cannot-verify.ts
├── undeclared.ts         # file-level + symbol-level undeclared detection
├── diff.ts               # unified diff → DiffSet (parse-diff wrapper)
├── locate-route.ts       # locateRoute() + detectFramework() — re-exported from index.ts
└── verdict.ts            # VerdictReport constructor, reviewer_focus builder
```

The `PROJECT_SPEC.md §6` monorepo layout is updated to add `checks/` and `locate-route.ts` to the `core/src/` tree.
