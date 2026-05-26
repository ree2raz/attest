# CLI Specification: `attest verify` (v0.1)

Status: **Ready for implementation.**
Package: `@attest/cli`
Companions: `PROJECT_SPEC.md`, `SCHEMA_V0.1.md`, `DETECTOR_AUTHENTICATION_SPEC.md`

---

## 1. Purpose

Prove the core loop works end-to-end in a single process: manifest in, diff in, verdict out. This CLI is the "hello world" acceptance artifact for v0.1. Every other future surface (MCP server, GitHub App) is a different driver over the same core.

---

## 2. Binary and command structure

**Binary**: `attest` (installed via `npm i -g @attest/cli` in future; repo-local via `pnpm link` for v0.1)

**Commands in v0.1**: exactly one — `verify`

```
attest verify --manifest <path> --diff <path|-> [options]
```

No other commands ship in v0.1. Calling `attest` with no args prints help and exits 0. Calling `attest <unknown>` prints help and exits 64 (EX_USAGE).

---

## 3. Arguments and flags

| Flag              | Short | Required | Default | Type      | Description                                                                 |
|-------------------|-------|----------|---------|-----------|------------------------------------------------------------------------------|
| `--manifest`      | `-m`  | yes      | —       | path      | Path to the manifest JSON conforming to `SCHEMA_V0.1.md`                    |
| `--diff`          | `-d`  | yes      | —       | path or `-` | Path to a unified-diff file, or `-` to read from stdin                    |
| `--repo-root`     | `-r`  | no       | `process.cwd()` | path | Repository root for resolving relative paths in the manifest            |
| `--format`        | `-f`  | no       | `human` | enum      | Output format: `human` or `json`                                            |
| `--no-color`      |       | no       | `false` | boolean   | Disable ANSI color in `human` format. Also respected: `NO_COLOR` env var    |
| `--verbose`       | `-v`  | no       | `false` | boolean   | Emit detector-level diagnostics to stderr                                   |
| `--help`          | `-h`  | no       | —       | boolean   | Print help to stdout, exit 0                                                |
| `--version`       | `-V`  | no       | —       | boolean   | Print version to stdout, exit 0                                             |

**Argument parsing**: `clipanion`. Unknown flags → exit 64 with a clear error on stderr. Missing required flag → exit 64.

---

## 4. Input contracts

### 4.1 Manifest

- Must be valid JSON
- Must validate against `@attest/schema`
- Path resolution: absolute paths used as-is; relative paths resolved against `process.cwd()`
- File not found → exit 66 (EX_NOINPUT)
- JSON parse error → exit 65 (EX_DATAERR)
- Schema validation failure → exit 2, with every validation error printed to stderr (one per line, `path: code: message` format)

### 4.2 Diff

- Must be a unified diff (output of `git diff`, `git format-patch`, or equivalent)
- When `--diff -` is specified, read from stdin until EOF
- Paths inside the diff are interpreted relative to `--repo-root`
- Binary files in the diff → logged to stderr as `warn: binary file skipped: <path>`, continue processing
- Empty diff (no changes) → exit 65 with stderr `error: diff contains no changes`

### 4.3 Repo root

- Must be a directory that exists
- Missing → exit 66
- Used to resolve paths in `session.files_touched` and `claim.target.path` when those are relative

---

## 5. Output contracts

### 5.1 `human` format (stdout)

Matches the mockup in `SCHEMA_V0.1.md` §11 exactly. Structure:

```
🤖 Agent: <agent> (<model>) · <tool_calls_count> tool calls · <N> files touched
📝 Task: <task.summary>

📋 Declared changes (<N>):
  <icon> <id>  <one-line evidence summary>
  <icon> <id>  <one-line evidence summary>
  ...

⚠️ Undeclared modifications (<M>):
  • <path> — symbol `<symbol>` modified but not in any claim
  • <path> — file modified but not in any claim
  ...

🔍 Reviewer focus:
  1. <reason>
  2. <reason>
  ...
```

**Icon mapping**:
- `verified` → `✅`
- `unverified` → `❌`
- `partial` → `⚠️`
- `unverifiable` → `ⓘ`

**Rules**:
- The "Undeclared modifications" section is omitted if empty
- The "Reviewer focus" section is omitted only when every claim is `verified` AND there are zero undeclared findings. Otherwise it always appears
- One-line evidence summary: the first evidence entry's `note`, or a fallback constructed from `claim.target` and `reason_code` if no evidence — agents implementing this should see §5.3
- Color: verdict icons are colorized when TTY and `--no-color` not set. `verified` → green, `unverified` → red, `partial` → yellow, `unverifiable` → cyan

**`reviewer_focus` ordering** (applies to both human and JSON output; arrays are order-sensitive in the golden-path test):
1. `unverified` and `partial` ClaimResult entries, in manifest claim-id order
2. UndeclaredFinding entries, sorted lexicographically by `path` then `symbol` (nulls last)
`unverifiable` claims do not appear in `reviewer_focus`.

**`reviewer_focus[].reason` string templates** (used verbatim; these are separate from the per-claim one-line summary in §5.3):

| Condition | Template |
|---|---|
| `behavior_present` claim, `unverified` or `partial` | `"<claim_id> failed — <params.property humanized> not detected"` |
| Other check kind, `unverified`, has `reason_code` | `"<claim_id> — <reason_code humanized>"` |
| Other check kind, `unverified`, no `reason_code` | `"<claim_id> — <check kind humanized> failed"` |
| Undeclared symbol finding | `"undeclared change to \`<symbol>\`"` |
| Undeclared file finding | `"undeclared file <path>"` |

Humanization: replace underscores with spaces. Example: `no_auth_in_chain` → `"no auth in chain"`, `rate_limiting` → `"rate limiting"`.

### 5.2 `json` format (stdout)

Single JSON document matching `VerdictReport` from `PROJECT_SPEC.md` §8.2. Pretty-printed with 2-space indentation. Final newline.

Example (for the golden-path test in §7):

```json
{
  "manifest_hash": "sha256:<hash of the input manifest bytes>",
  "summary": {
    "total_claims": 4,
    "verified": 3,
    "unverified": 1,
    "partial": 0,
    "unverifiable": 0,
    "undeclared_files": 0,
    "undeclared_symbols": 1
  },
  "claims": [
    {
      "claim_id": "c1",
      "verdict": "verified",
      "evidence": [
        { "kind": "symbol", "path": "src/auth/email.ts", "symbol": "EmailVerificationService", "note": "class declaration found" }
      ]
    },
    {
      "claim_id": "c2",
      "verdict": "verified",
      "evidence": [
        { "kind": "route", "path": "src/routes/auth.ts", "symbol": "POST /verify", "note": "express route registered" }
      ]
    },
    {
      "claim_id": "c3",
      "verdict": "unverified",
      "reason_code": "no_auth_in_chain",
      "evidence": [
        { "kind": "middleware-chain", "path": "src/routes/auth.ts", "symbol": "POST /verify", "note": "no rate_limiting middleware found in chain" }
      ]
    },
    {
      "claim_id": "c4",
      "verdict": "verified",
      "evidence": [
        { "kind": "test", "path": "src/auth/email.test.ts", "symbol": "EmailVerificationService", "note": "3 tests reference subject symbol" }
      ]
    }
  ],
  "undeclared": [
    { "type": "symbol", "path": "src/auth/email.ts", "symbol": "generateSecret" }
  ],
  "reviewer_focus": [
    { "claim_id": "c3", "reason": "claim unverified: rate_limiting not detected" },
    { "undeclared": { "type": "symbol", "path": "src/auth/email.ts", "symbol": "generateSecret" }, "reason": "undeclared symbol modification" }
  ]
}
```

Note: v0.1 ships with the authentication detector only. The c3 rate_limiting example above is drawn from `SCHEMA_V0.1.md` §11 for consistency, but in v0.1 the rate_limiting check will return `unverifiable` with reason `detector_not_implemented`. See §7 for the revised golden-path that v0.1 actually verifies.

### 5.3 Evidence summarization rules (human format)

For each claim, the one-line summary is produced by:

1. Find the first evidence entry with a non-empty `note` field (scanning all entries, not just index 0). If found → use that note verbatim (truncated to 120 chars).
2. Else if `reason_code` is present → `<reason_code_humanized> at <target.path>:<target.symbol>`
3. Else → `<target.kind> <target.symbol> in <target.path>`

`reason_code_humanized` converts `snake_case` to human phrase, e.g., `no_auth_in_chain` → "no auth in chain".

Note: the authentication detector places a no-note route summary entry at `evidence[0]` (see `DETECTOR_AUTHENTICATION_SPEC.md §6`), so rule 1 finds the first *meaningful* note in `evidence[1+]` for verified claims, and falls through to rule 2 for unverified/no-auth claims where no entry has a note.

### 5.4 Stderr

- `--verbose` enables per-detector diagnostics (e.g., "running authentication detector on claim c3")
- Warnings (binary files, etc.) always go to stderr regardless of `--verbose`
- Schema validation errors always go to stderr
- No progress bars, no spinners — pipe-friendly

---

## 6. Exit codes

| Code | Meaning                                                                   |
|------|---------------------------------------------------------------------------|
| 0    | All claims verified; zero undeclared findings                             |
| 1    | At least one claim is `unverified` or `partial`, or ≥1 undeclared finding |
| 2    | Manifest failed schema validation                                         |
| 64   | Usage error (unknown flag, missing required flag, unknown command)        |
| 65   | Input data error (malformed JSON, empty diff, etc.)                       |
| 66   | Input file not found (manifest, diff, or repo-root missing)               |
| 70   | Internal error (parse error in verifier, unexpected exception)            |

`unverifiable` alone does **not** cause exit 1 — it is a neutral state ("manual review needed"). Only `unverified`, `partial`, or undeclared findings cause exit 1. Rationale: the CLI should not block CI on claims we cannot check (`cannot_express`, `refactor`). Those are always for humans.

---

## 7. Golden-path end-to-end test (v0.1 version)

The CLI is acceptance-complete when this test passes exactly.

### 7.1 Setup

Create a minimal fixture repo at `packages/cli/test/fixtures/golden-path/`:

```
golden-path/
├── src/
│   └── routes/
│       └── auth.ts          # post-diff state
├── manifest.json
├── input.diff               # unified diff
├── expected-human.txt       # expected stdout when --format=human --no-color
└── expected.json            # expected stdout when --format=json
```

### 7.2 Fixture contents (describe; agent writes)

**`manifest.json`** — a minimal manifest with exactly two claims:

1. `c1`: `add_symbol`, target `{ kind: "endpoint", path: "src/routes/auth.ts", symbol: "POST /login" }`, check `symbol_exists`
2. `c2`: `modify_behavior`, target same endpoint, check `behavior_present` with `{ property: "authentication" }`

**`src/routes/auth.ts`** — post-diff TypeScript source containing:

- An Express import
- `app.post("/login", handler)` — NO auth middleware
- The handler function (any body)

**`input.diff`** — the unified diff that:

- Adds `src/routes/auth.ts` (new file)
- Adds a symbol `unlistedHelper` not claimed in the manifest

**Expected verdicts**:

- `c1` → `verified` (endpoint exists)
- `c2` → `unverified`, reason `no_auth_in_chain` (the authentication detector finds no auth)
- Undeclared finding: `unlistedHelper` in `src/routes/auth.ts`
- Exit code: `1`

### 7.3 Expected `human` output (with `--no-color`)

```
🤖 Agent: claude-code (claude-opus-4-7) · 5 tool calls · 1 files touched
📝 Task: Add login endpoint

📋 Declared changes (2):
  ✅ c1  endpoint POST /login in src/routes/auth.ts
  ❌ c2  no auth in chain at src/routes/auth.ts:POST /login

⚠️ Undeclared modifications (1):
  • src/routes/auth.ts — symbol `unlistedHelper` modified but not in any claim

🔍 Reviewer focus:
  1. c2 failed — authentication not detected
  2. undeclared change to `unlistedHelper`
```

### 7.4 Test invocation

```
attest verify \
  --manifest packages/cli/test/fixtures/golden-path/manifest.json \
  --diff packages/cli/test/fixtures/golden-path/input.diff \
  --repo-root packages/cli/test/fixtures/golden-path \
  --format human \
  --no-color
```

The test asserts:
1. Exit code equals `1`
2. Stdout matches `expected-human.txt` byte-for-byte
3. With `--format json`, stdout is JSON-equal to `expected.json` (order-independent on object keys, order-sensitive on arrays)

---

## 8. Non-goals for v0.1 CLI

- No config file (`.attestrc`). All behavior is flag-driven.
- No plugin system. Detectors are compiled in.
- No interactive mode.
- No GitHub integration. The App is v0.3.
- No auto-fix / suggestion output. The CLI reports; humans act.
- No parallelism tuning. Detectors run sequentially in v0.1.

---

## 9. Implementation notes (hints, not specifications)

- `clipanion` supports strict typing of flags; use it fully
- Read the manifest with `fs.readFile` + `JSON.parse` — no streaming needed at this scale
- Stdin reading: consume the entire stream via `node:stream/consumers` `text()` when `--diff -`
- Computing `manifest_hash`: SHA-256 of the raw manifest file bytes (not a re-serialization). Prefix `sha256:` to match schema convention
- Color: use `picocolors` only if a color library is strictly necessary. v0.1 default: no extra dep — write ANSI codes inline behind a `useColor` flag

These are hints to guide the agent's implementation choices. The spec does not require any specific implementation; it only requires the contract.
