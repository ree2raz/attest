# Manifest contract — paste this into your agent's instructions

`attest verify` checks your agent's claims against the actual diff. To make a
manifest the verifier accepts, the agent (Claude Code, Cursor, Aider, or a raw
API) must emit the JSON below **in full**, with **no `description` fields and no
free-form prose** in place of structured claims. The verifier is structural: it
checks the shape, then runs each claim against the diff and the worktree. It
does not interpret English.

The full schema is in `@attest/schema` (single source of truth) and is
re-exported by `attest schema manifest`. The CLI's bundled copy is the same one
it validates against — no version drift.

## 1. The contract in one paragraph

Emit a single JSON object at `<repo>/.attest/manifest.json` (or whatever path
the user passes to `--manifest`). The top level is closed: `attest_version`
(only `"1.0"` is accepted), `task` (id + description), `agent` (id; optional
model and tool_calls), `generated_at` (RFC 3339 timestamp), `declared_scope`
(files — every file the agent touched, no omissions, no extras), and `claims`
(an array, non-empty, of the closed kinds below). Any other top-level field
makes the manifest invalid; the CLI exits 2 and prints a path-pointed error.

## 2. The closed claim taxonomy

Each `claims[i]` is exactly one of these shapes. There is no other kind in v1.0.

| `kind`            | Required fields                                                 | What attest checks                                                              |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `file_change`     | `op` (`"create"` \| `"modify"` \| `"delete"`), `path`           | the diff has a matching hunk for `path` with that `op`                          |
| `symbol_added`    | `path`, `symbol`, `symbol_kind`                                 | the post-change file declares `symbol` as `symbol_kind`                         |
| `symbol_removed`  | `path`, `symbol`, `symbol_kind`                                 | the symbol is gone in the post file                                             |
| `symbol_modified` | `path`, `symbol`, `symbol_kind`                                 | the symbol's declaration text changed in the diff                               |
| `test_added`      | `path`, optional `covers`                                       | a test file was added; if `covers` given, a test referencing `covers` was added |
| `test_modified`   | `path`, optional `covers`                                       | as above for a modification                                                     |
| `outcome`         | `check` (`"build_passes"` \| `"tests_pass"` \| `"lint_passes"`) | the runner executes the resolved command in a worktree and matches exit code    |

`claim.id` is a stable identifier that the agent picks (`"c1"`, `"c2"`, …);
attest asserts on `id`+`status`, so the human reading the verdict can trace
each claim to the agent's reasoning. The pattern is `^c[0-9]+$`.

## 3. What attest does NOT do (read this)

- **No semantic claims.** "Authentication is enforced on every path," "input
  is validated," "no SQL injection" are _semantic_ — they require understanding
  what the code _means_. attest refuses to answer these with a heuristic. A
  semantic claim (`kind: "behavior_present"`, or any unknown `kind`) is
  reported as `unverifiable` with an LLM-review pointer — **never a pass and
  never a fail**. Route those to a reviewer tool (CodeRabbit, Greptile, human
  review).
- **No LLM in the verification path.** Determinism is the product. If a
  heuristic starts deciding correctness, attest has stopped being attest.
- **No "agent said it, so it must be true."** Every claim is checked. If a
  claim is false, the verdict is `fail` (exit 1). If a file was changed but
  not declared, the verdict is `fail` (scope drift).
- **No `description` field on a claim.** If the agent wants to _explain_ a
  claim, it goes in the human-facing manifest comment, not in the JSON. The
  verifier ignores `description` on claims (allowed, not validated).

## 4. Minimal example (TypeScript)

```json
{
  "attest_version": "1.0",
  "task": { "id": "add-login", "description": "Add login() to auth" },
  "agent": { "id": "claude-code", "model": "claude-opus-4-8", "tool_calls": 4 },
  "generated_at": "2026-06-06T12:00:00Z",
  "declared_scope": { "files": ["src/auth.ts", "tests/auth.test.ts"] },
  "claims": [
    { "id": "c1", "kind": "file_change", "op": "modify", "path": "src/auth.ts" },
    {
      "id": "c2",
      "kind": "symbol_added",
      "path": "src/auth.ts",
      "symbol": "login",
      "symbol_kind": "function"
    },
    { "id": "c3", "kind": "test_added", "path": "tests/auth.test.ts", "covers": "login" },
    { "id": "c4", "kind": "outcome", "check": "tests_pass" }
  ]
}
```

## 5. The `declared_scope` rule

`declared_scope.files` must equal the union of all `path` values from every
claim, **plus** any file the agent touched that isn't named in a claim (so
attest can flag it as undeclared). In practice: list every file the agent
edited, full stop. A missing entry causes `undeclared_changes` and exit 1.
An extra entry is ignored.

## 6. The exit code contract

| Exit | Meaning                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | Every claim is `verified` or `unverifiable`; zero flagged undeclared.                                                          |
| `1`  | At least one claim is `failed`, or at least one undeclared change is flagged.                                                  |
| `2`  | The manifest is structurally invalid (wrong `kind`, missing field, wrong `attest_version`, etc.). Fix the manifest and re-run. |
| `65` | Input data error (e.g. JSON parse failure on `--manifest`).                                                                    |
| `66` | A required file is missing (manifest, diff, repo root).                                                                        |
| `70` | Internal error.                                                                                                                |

`unverifiable` is an **allowed** status — it does not fail the build. It is
the verifier's way of saying "this is outside my scope, route it to a
reviewer." The agent or human adds `covers`, `test_*`, or `outcome` claims
themselves; the verifier never invents them.

## 7. Drift failures you'll see in CI

If the manifest is malformed, the CLI prints one path-pointed line per issue
and exits 2. Common ones:

- `attest_version: must be exactly "1.0" (the only supported manifest version)`
- `claims/0/op: must be one of "create", "modify", "delete" (file_change claims need a known operation)`
- `claims/0/id: must match the pattern ^c[0-9]+$ (e.g. "c1", "c2", "c10") — claim ids are stable identifiers used by humans and CI logs`
- `claims/0/check: must be one of "build_passes", "tests_pass", "lint_passes" (outcome claims declare which check was run; build/tests/lint are the supported v1.0 set)`
- `manifest: unknown top-level field "..." — the v1.0 manifest has a closed top-level shape (attest_version, task, agent, generated_at, declared_scope, claims)`

## 8. How the agent should produce one

1. Run `attest init --diff <path-to-unified-diff>` (or omit `--diff` to use
   `git diff HEAD` against `--repo-root`). The CLI emits a JSON skeleton with
   `declared_scope.files` and a `file_change` claim per touched file, plus
   `symbol_added/removed/modified` stubs derived from tree-sitter extraction
   on the post-change file. No LLM involved.
2. The agent (or human) fills in `outcome` claims and any `covers` strings
   the skeleton didn't auto-generate.
3. The user runs `attest verify --manifest .attest/manifest.json --diff <diff> --repo-root .`.

The skeleton is deterministic — same diff, same skeleton, every time. Two
agents working off the same diff produce the same starting manifest.
