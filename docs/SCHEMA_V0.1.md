# Claim Verification Schema — v0.1

Status: **Draft — not yet implemented**
Scope: TypeScript first. Python in v0.2.
Surface: MCP (Model Context Protocol) server exposes a single tool, `declare_changes`. Agent must call it before finishing. Output is rendered by the GitHub App as a single PR comment.

---

## 1. Design principles (non-negotiable)

1. Every claim must be verifiable in principle by deterministic means — no free-text performance or quality claims.
2. `target.symbol` must be AST-locatable in the post-diff tree. Hard-fail if not.
3. The verifier trusts nothing the agent says about outcomes — it re-runs the check independently.
4. `unverifiable` is a valid verdict. Failing gracefully beats false certainty.
5. Undeclared modifications are surfaced as loudly as failed claims. Silence-by-omission is the default attack surface; close it.

---

## 2. Top-level manifest

```jsonc
{
  "schema_version": "0.1",
  "session": {
    "agent": "claude-code" | "codex" | "cursor" | "opencode" | "other",
    "model": "string",                 // e.g. "claude-opus-4-7"
    "session_id": "uuid",
    "started_at": "ISO8601",
    "completed_at": "ISO8601",
    "prompt_hash": "sha256:...",       // hash only — never raw prompt
    "tool_calls_count": 0,             // integer
    "files_touched": ["path1", "path2"]
  },
  "task": {
    "summary": "string",               // one sentence, <=120 chars, human-readable
    "source": "user_prompt" | "issue_reference" | "continuation"
  },
  "claims": [ /* see §4 */ ]
}
```

**Flat claim list in v0.1.** No `parent_id`, no DAG. Grouping deferred until the core verification loop is proven.

---

## 3. JSON Schema (strict validation)

Reject manifests that do not validate. No soft-fails. No defaults.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/claim-verification/v0.1",
  "type": "object",
  "required": ["schema_version", "session", "task", "claims"],
  "additionalProperties": false,
  "properties": {
    "schema_version": { "const": "0.1" },
    "session": {
      "type": "object",
      "required": ["agent", "model", "session_id", "started_at", "completed_at",
                   "prompt_hash", "tool_calls_count", "files_touched"],
      "additionalProperties": false,
      "properties": {
        "agent":   { "enum": ["claude-code", "codex", "cursor", "opencode", "other"] },
        "model":   { "type": "string", "minLength": 1 },
        "session_id": { "type": "string", "format": "uuid" },
        "started_at":   { "type": "string", "format": "date-time" },
        "completed_at": { "type": "string", "format": "date-time" },
        "prompt_hash":  { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
        "tool_calls_count": { "type": "integer", "minimum": 0 },
        "files_touched":    { "type": "array", "items": { "type": "string" } }
      }
    },
    "task": {
      "type": "object",
      "required": ["summary", "source"],
      "additionalProperties": false,
      "properties": {
        "summary": { "type": "string", "maxLength": 120 },
        "source":  { "enum": ["user_prompt", "issue_reference", "continuation"] }
      }
    },
    "claims": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/claim" }
    }
  },
  "$defs": {
    "claim": {
      "type": "object",
      "required": ["id", "type", "target", "description", "verification_contract"],
      "additionalProperties": false,
      "properties": {
        "id":   { "type": "string", "pattern": "^c[0-9]+$" },
        "type": { "enum": [
          "add_symbol", "remove_symbol", "modify_signature",
          "modify_behavior", "add_test", "refactor",
          "add_dependency", "remove_dependency", "config_change"
        ]},
        "target": {
          "type": "object",
          "required": ["kind", "path"],
          "additionalProperties": false,
          "properties": {
            "kind":   { "enum": ["function", "class", "type", "endpoint",
                                 "file", "module", "config_key", "package"] },
            "path":   { "type": "string" },
            "symbol": { "type": "string" }
          }
        },
        "description": { "type": "string", "maxLength": 280 },
        "verification_contract": {
          "type": "object",
          "required": ["check"],
          "additionalProperties": false,
          "properties": {
            "check": { "enum": [
              "symbol_exists", "behavior_present", "test_covers",
              "signature_matches", "removed", "cannot_verify"
            ]},
            "params": { "type": "object" }
          }
        }
      }
    }
  }
}
```

---

## 4. Claim `type` — what the claim asserts

| `type`               | What the agent is declaring                             | Default `check`             |
|----------------------|---------------------------------------------------------|------------------------------|
| `add_symbol`         | A new function/class/type/endpoint was introduced       | `symbol_exists`              |
| `remove_symbol`      | An existing symbol was deleted                          | `removed`                    |
| `modify_signature`   | Params/return type of an existing symbol changed        | `signature_matches`          |
| `modify_behavior`    | Logic of an existing symbol changed in a named way      | `behavior_present`           |
| `add_test`           | A new test targeting a specific symbol was added        | `test_covers`                |
| `refactor`           | Structural change, behavior preserved (unverifiable)    | `cannot_verify`              |
| `add_dependency`     | A package was added to manifest                         | `symbol_exists` (on manifest)|
| `remove_dependency`  | A package was removed from manifest                     | `removed`                    |
| `config_change`      | A config key was changed to a specific value            | `signature_matches`          |

`refactor` is deliberately routed to `cannot_verify`. This is not a loophole — it flags the claim for mandatory human review. Agents that try to launder behavior changes through `refactor` will get caught when the `files_touched` set is larger than the `refactor` claim's target.

---

## 5. `verification_contract.check` — how the verifier checks

| `check`              | Params                                    | What the verifier runs                                     |
|----------------------|-------------------------------------------|-------------------------------------------------------------|
| `symbol_exists`      | none                                      | Parse post-diff file; assert `target.symbol` resolves.      |
| `behavior_present`   | `{ property: <behavioral_property> }`     | Run behavior detector for `property` on target symbol.      |
| `test_covers`        | `{ subject_symbol: string }`              | Assert new test imports or names `subject_symbol`.          |
| `signature_matches`  | `{ expected: string }`                    | Compare AST signature of `target.symbol` to `expected`.     |
| `removed`            | none                                      | Assert `target.symbol` is absent in post-diff tree.         |
| `cannot_verify`      | none                                      | No-op; verdict = `unverifiable`.                            |

---

## 6. `behavioral_property` enum — v0.1 ships with ten

Each property is (a) a short string identifier, (b) a plain-English definition, and (c) a **detector contract** — the set of AST patterns the verifier must recognize as satisfying the claim. The detector is language-specific; TypeScript patterns below.

### 6.1 `null_check`
- **Definition**: the target symbol guards against null/undefined input before dereference.
- **Detector must find at least one of**:
  - Optional chaining (`?.`) applied to a parameter of `target.symbol`
  - Nullish coalescing (`??`) applied to a parameter
  - Explicit guard: `if (x == null)`, `if (!x)`, `if (x === undefined)`
  - Validation library call whose schema marks the field `.nullable()` or `.optional()` — and the call appears before the first dereference
- **Fails if**: no guard appears on any parameter path leading to a dereference.

### 6.2 `input_validation`
- **Definition**: inputs are validated against a schema or explicit constraints before use.
- **Detector must find**:
  - A call to `zod.parse`, `zod.safeParse`, `yup.validate`, `joi.validate`, `class-validator` decorators, or `ajv.compile`
  - OR explicit type/range/format checks on each input parameter
- **Fails if**: inputs reach a side-effecting call (DB write, network, FS) without passing through a validator.

### 6.3 `error_handling`
- **Definition**: the target symbol handles expected failure modes rather than letting them throw uncaught.
- **Detector must find**:
  - `try/catch` block wrapping the primary operation
  - OR `.catch()` on a promise chain
  - OR a `Result` / `Either` return type with explicit error branch
- **Fails if**: the primary operation is a call that can throw and no catch exists on any path.

### 6.4 `authentication`
- **Definition**: a route/handler requires an authenticated caller before executing.
- **Detector must find**:
  - Auth middleware applied to the route (`app.use(authMiddleware)`, decorator, route guard)
  - OR an explicit token/session check as the first statement of the handler
- **Fails if**: the handler performs protected work before any auth check.

### 6.5 `authorization`
- **Definition**: the handler checks that the authenticated caller has permission for the specific resource/action.
- **Detector must find**:
  - A call to a permission/role check (`hasPermission`, `can`, `isAdmin`, `authorize`, CASL ability check) that precedes resource access
- **Fails if**: auth exists but no permission check is performed before the resource is read/written.

### 6.6 `rate_limiting`
- **Definition**: the route is protected against abuse by request-frequency limits.
- **Detector must find**:
  - Middleware from `express-rate-limit`, `@fastify/rate-limit`, `rate-limiter-flexible`, or equivalent
  - OR an explicit token-bucket / sliding-window check using a datastore
- **Fails if**: the route has no such middleware and no inline check.

### 6.7 `logging`
- **Definition**: a logger call is added at the relevant path (success, error, or audit event).
- **Detector must find**:
  - A call to a known logger (`pino`, `winston`, `bunyan`, `console.error` in a catch block, platform logger) inside `target.symbol`
- **Fails if**: no such call exists inside the symbol body.

### 6.8 `sanitization`
- **Definition**: user-provided input is sanitized before being used in HTML, SQL, shell, or filesystem context.
- **Detector must find**:
  - A call to `DOMPurify`, `validator.escape`, `sqlstring.escape`, `path.resolve` + boundary check, or a parameterized query builder
  - OR the input is passed to an ORM method that parameterizes by default (Prisma, TypeORM, Drizzle query builder — not raw SQL)
- **Fails if**: user input flows into `res.send`, `exec`, raw SQL, or unbounded FS path.

### 6.9 `timeout`
- **Definition**: a bounded wait is enforced on a network or long-running operation.
- **Detector must find**:
  - `AbortController` + `signal` passed to fetch/axios
  - OR `axios({ timeout })`, `fetch(..., { signal: AbortSignal.timeout(n) })`
  - OR `Promise.race` against `setTimeout`
- **Fails if**: the call has no upper bound on completion time.

### 6.10 `retry_logic`
- **Definition**: a failing operation is retried according to a defined policy.
- **Detector must find**:
  - A call to a retry library (`p-retry`, `async-retry`, `cockatiel`, `@aws-sdk/middleware-retry`)
  - OR a loop with backoff (`for`/`while` + `setTimeout`/`sleep` + exponential factor)
- **Fails if**: the operation can fail transiently and no retry is present.

**Escape hatch**: `cannot_express` is an eleventh valid value for `behavioral_property`. Claims using it are routed to `unverifiable` and surfaced as ⚠️ in the PR comment. Do not let this become the default — instrument its usage and if any single agent emits it on more than 20% of claims, that is itself a signal worth surfacing.

---

## 7. Verifier outcomes

Every claim resolves to exactly one verdict:

| Verdict        | Icon | Meaning                                                                 |
|----------------|------|-------------------------------------------------------------------------|
| `verified`     | ✅   | Deterministic check passed.                                             |
| `unverified`   | ❌   | Deterministic check failed — the claim does not match the diff.         |
| `partial`      | ⚠️   | Target symbol exists and was modified, but behavior check inconclusive. |
| `unverifiable` | ⓘ    | Claim used `cannot_verify` or `cannot_express` — manual review needed. |

The reviewer's attention should flow: ❌ → ⚠️ → ⓘ → ✅.

---

## 8. Undeclared-changes detection (mandatory)

This is the countermeasure against silence-by-omission. The verifier computes:

```
declared_files   = union of claim.target.path across all claims
diff_paths       = union of changed file paths across all diff entries
undeclared_files = (diff_paths ∪ session.files_touched) − declared_files
```

Using the union of `diff_paths` and `files_touched` closes the omission vector: a file present in the diff but absent from `files_touched` is still flagged. See `CORE_CHECKS_SPEC.md §4.1` for the full algorithm.

For each file in `undeclared_files`, the verifier emits a synthetic `undeclared_modification` entry with verdict `unverified` and a mandatory reviewer focus marker. These are surfaced prominently in the report.

Further: for each declared file, the verifier walks the diff and identifies modified symbols not named in any claim targeting that file. These become `undeclared_symbol_change` entries with the same verdict.

Threshold: **zero tolerance**. Any undeclared change, at file or symbol level, is a reviewer focus point.

---

## 9. Hard-fail validation rules

The MCP server must reject the `declare_changes` call with a structured error if any of:

1. The manifest fails JSON Schema validation.
2. `target.symbol` is specified but cannot be resolved by AST parse of the post-diff tree for `target.path`.
3. `verification_contract.check = "behavior_present"` but `params.property` is not in the `behavioral_property` enum.
4. `claims` is empty.
5. `files_touched` contains a path outside the repo root.

Rejection returns an error payload the agent can read and retry against. No partial acceptance.

---

## 10. Example — a valid manifest

```jsonc
{
  "schema_version": "0.1",
  "session": {
    "agent": "claude-code",
    "model": "claude-opus-4-7",
    "session_id": "b3a1c0e2-9e2f-4e6a-8d13-1f2a3b4c5d6e",
    "started_at": "2026-04-19T12:34:56Z",
    "completed_at": "2026-04-19T12:41:22Z",
    "prompt_hash": "sha256:a3f1c2e4b5d6f7a8c9e0b1d2f3a4c5e6b7d8f9a0c1e2b3d4f5a6c7e8b9d0f1a2",
    "tool_calls_count": 23,
    "files_touched": [
      "src/auth/email.ts",
      "src/routes/auth.ts",
      "src/auth/email.test.ts",
      "package.json"
    ]
  },
  "task": {
    "summary": "Add email verification flow with rate-limited /verify endpoint",
    "source": "user_prompt"
  },
  "claims": [
    {
      "id": "c1",
      "type": "add_symbol",
      "target": {
        "kind": "class",
        "path": "src/auth/email.ts",
        "symbol": "EmailVerificationService"
      },
      "description": "Service for generating and validating email tokens (15-min TTL)",
      "verification_contract": { "check": "symbol_exists" }
    },
    {
      "id": "c2",
      "type": "add_symbol",
      "target": {
        "kind": "endpoint",
        "path": "src/routes/auth.ts",
        "symbol": "POST /verify"
      },
      "description": "Route that validates a token and activates the user",
      "verification_contract": { "check": "symbol_exists" }
    },
    {
      "id": "c3",
      "type": "modify_behavior",
      "target": {
        "kind": "endpoint",
        "path": "src/routes/auth.ts",
        "symbol": "POST /verify"
      },
      "description": "Applied rate limiting to prevent brute-force token guessing",
      "verification_contract": {
        "check": "behavior_present",
        "params": { "property": "rate_limiting" }
      }
    },
    {
      "id": "c4",
      "type": "add_test",
      "target": {
        "kind": "file",
        "path": "src/auth/email.test.ts"
      },
      "description": "Unit tests for EmailVerificationService token generation and expiry",
      "verification_contract": {
        "check": "test_covers",
        "params": { "subject_symbol": "EmailVerificationService" }
      }
    }
  ]
}
```

---

## 11. Example — verifier output (rendered as PR comment)

```
🤖 Agent: claude-code (claude-opus-4-7) · 23 tool calls · 4 files touched
📝 Task: Add email verification flow with rate-limited /verify endpoint

📋 Declared changes (4):
  ✅ c1  EmailVerificationService exists in src/auth/email.ts
  ✅ c2  POST /verify registered in src/routes/auth.ts
  ❌ c3  "rate_limiting" NOT detected on POST /verify — no middleware or inline limiter
  ✅ c4  src/auth/email.test.ts imports EmailVerificationService (3 tests)

⚠️ Undeclared modifications (1):
  • src/auth/email.ts — symbol `generateSecret` modified but not in any claim

🔍 Reviewer focus:
  1. c3 failed — rate-limiting claim unverified
  2. undeclared change to `generateSecret`
```

---

## 12. Out of scope for v0.1

- Test execution (we check test presence and subject, not actual branch coverage)
- Concurrency/thread-safety claims
- Performance claims
- Cross-file semantic claims that can't be reduced to AST patterns
- Pre-declaration flow (agent declares intent before writing code)
- Multi-session provenance chaining
- Non-TypeScript languages (Python in v0.2)

---

## 13. Versioning

Schema versions are semver-major on any breaking field change. The `schema_version` constant in the manifest is the sole gate. Verifier rejects manifests with unrecognized versions.
