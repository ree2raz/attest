# Show HN — draft

**Title:** attest — deterministic checker for what your AI agent actually changed

**Body (aimed at HN's "show, don't tell" culture):**

I built `attest` after watching three weeks of "the agent said it shipped X" turn
into "the agent shipped X minus one import, plus a Y the agent didn't mention,
and the test passes because it tests nothing." The PR looks fine at 2am.
Three days later the on-call engineer finds the bug.

attest closes the gap structurally. The agent emits a small JSON manifest
describing its changes; `attest verify` checks each claim against the actual
diff and the worktree, in pure deterministic code, with no LLM in the path.
The result is a structured verdict: pass, fail (with the specific claim that
failed), or unverifiable (with a pointer to human review). Exit codes are
distinct: 0 = pass, 1 = verification fail, 2 = malformed manifest.

The interesting part is what it **does not** do. attest refuses to answer
"is the code correct?" or "is auth enforced on every route?" — those are
semantic, and the only honest answer is to flag them as `unverifiable` and
send them to a reviewer. Determinism is the product; a checker that
heuristically guesses correctness stops being trustworthy.

```bash
# Manifest the agent emits (or `attest init` produces from a diff):
{
  "attest_version": "1.0",
  "task": { "id": "add-login", "description": "Add login() to auth" },
  "declared_scope": { "files": ["src/auth.ts", "tests/auth.test.ts"] },
  "claims": [
    { "id": "c1", "kind": "file_change", "op": "modify", "path": "src/auth.ts" },
    { "id": "c2", "kind": "symbol_added", "path": "src/auth.ts", "symbol": "login", "symbol_kind": "function" },
    { "id": "c3", "kind": "test_added", "path": "tests/auth.test.ts", "covers": "login" },
    { "id": "c4", "kind": "outcome", "check": "tests_pass" }
  ]
}
```

```bash
$ npx @attest/cli verify --manifest .attest/manifest.json --diff change.diff --repo-root .
attest v1.0 · task: add-login

Claims (4):
  ✓ c1  file_change  modify  src/auth.ts
  ✓ c2  symbol_added  login (function)  src/auth.ts
  ✓ c3  test_added  tests/auth.test.ts  covers: login
  ✗ c4  outcome  tests_pass  → npm test exited 1 (1 of 4 tests failed: login › accepts a non-empty user and token)

Summary: 3 verified · 1 failed · 0 unverifiable · 0 undeclared
Result: FAIL
```

GitHub Action: `uses: ree2raz/attest@v1` (composite; uses `npx @attest/cli`
under the hood). TypeScript, Python, and Go are first-class. The corpus
(21 fixture cases across the three languages, including the agent's
manifest and the actual diff) is the regression oracle.

It's Apache-2.0, no SaaS, no telemetry, no required network calls. The
runner executes the declared build/test commands in a `git worktree` —
not a VM or container, so treat the runner like `npm test`: only as
trusted as the code you aim it at. Container isolation is a Phase 2 item.

Repo: https://github.com/ree2raz/attest
Manifest contract (paste-in for your agent's instructions): docs/manifest-contract.md
Fixture corpus (the regression oracle): corpus/
