# attest

> Closes the gap between what an AI coding agent claims it changed and what it actually changed.

`attest` is a deterministic, locally-runnable CLI tool. An AI agent emits a structured JSON manifest describing its changes; `attest verify` checks each claim against the actual diff and produces a structured verdict. No LLM in the verification path. No SaaS dependency. Apache-2.0 licensed.

## 20-minute zero-to-first-verdict

### 1. Install

```bash
git clone https://github.com/ree2raz/attest
cd attest
pnpm install
pnpm build
```

### 2. Try the TypeScript example

The `corpus/ts/base/` directory is a small TypeScript project. Let's verify a change:

```bash
# Materialize the base project
mkdir -p /tmp/attest-demo
cp -a corpus/ts/base/. /tmp/attest-demo/
cd /tmp/attest-demo
git init -q
git add -A
git commit -qm "base"

# Verify the "honest" case: agent claims it added login() to src/auth.ts
attest verify \
  --manifest /path/to/attest/corpus/ts/cases/honest/manifest.json \
  --diff /path/to/attest/corpus/ts/cases/honest/change.diff \
  --repo-root /tmp/attest-demo \
  --format human
```

Output:

```
attest v1.0 · task: ts-honest

Claims (5):
  ✓ c1  file_change: modify src/auth.ts
  ✓ c2  symbol_added: function login in src/auth.ts
  ✓ c3  test_added: tests/auth.test.ts (covers login)
  ✓ c4  outcome: tests_pass (npm test, 1.2s)
  ✓ c5  outcome: build_passes (npm run build, 0.8s)

Undeclared changes: 0

Result: pass (exit 0)
```

### 3. Try Python or Go

```bash
# Python example
mkdir -p /tmp/attest-py
cp -a corpus/py/base/. /tmp/attest-py/
cd /tmp/attest-py
git init -q && git add -A && git commit -qm "base"

attest verify \
  --manifest /path/to/attest/corpus/py/cases/honest/manifest.json \
  --diff /path/to/attest/corpus/py/cases/honest/change.diff \
  --repo-root /tmp/attest-py

# Go example
mkdir -p /tmp/attest-go
cp -a corpus/go/base/. /tmp/attest-go/
cd /tmp/attest-go
git init -q && git add -A && git commit -qm "base"

attest verify \
  --manifest /path/to/attest/corpus/go/cases/honest/manifest.json \
  --diff /path/to/attest/go/cases/honest/change.diff \
  --repo-root /tmp/attest-go
```

## Manifest format (v1.0)

The agent emits a JSON manifest describing its changes:

```json
{
  "attest_version": "1.0",
  "task": { "id": "add-login", "description": "Add login() to auth" },
  "agent": { "id": "claude-code", "model": "claude-opus-4-8", "tool_calls": 4 },
  "generated_at": "2026-06-05T10:00:00Z",
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
    { "id": "c4", "kind": "outcome", "check": "tests_pass" },
    { "id": "c5", "kind": "outcome", "check": "build_passes" }
  ]
}
```

`attest verify` checks each claim against the diff and produces a verdict:

```json
{
  "attest_version": "1.0",
  "task_id": "add-login",
  "result": "pass",
  "exit_code": 0,
  "claims": [
    { "id": "c1", "status": "verified", "evidence": { "op": "modify", "hunks": 1 } },
    {
      "id": "c2",
      "status": "verified",
      "evidence": { "node_kind": "function_declaration", "line": 9 }
    },
    {
      "id": "c3",
      "status": "verified",
      "evidence": { "path": "tests/auth.test.ts", "covers": "login" }
    },
    {
      "id": "c4",
      "status": "verified",
      "evidence": { "check": "tests_pass", "cmd": "npm test", "exit_code": 0, "duration_ms": 1200 }
    },
    {
      "id": "c5",
      "status": "verified",
      "evidence": {
        "check": "build_passes",
        "cmd": "npm run build",
        "exit_code": 0,
        "duration_ms": 800
      }
    }
  ],
  "undeclared_changes": [],
  "summary": { "claims_total": 5, "verified": 5, "failed": 0, "unverifiable": 0, "undeclared": 0 }
}
```

Exit 0 = all claims verified + zero undeclared changes. Exit 1 = something needs human attention.

See `docs/SPEC.md` §4 for the full manifest and verdict specifications.

## Configuration

`attest.config.json` (in the repo root) declares test/build/lint commands:

```json
{
  "test_cmd": "npm test",
  "build_cmd": "npm run build",
  "lint_cmd": "npm run lint",
  "allowlist_basenames": ["package-lock.json", "yarn.lock"],
  "allowlist_dirs": ["node_modules", "dist"]
}
```

If omitted, `attest` auto-detects commands from `package.json` scripts, `go.mod`, `pyproject.toml`, or `Makefile`.

## Packages

| Package                | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `@attest/schema`       | JSON Schema, TypeScript types, ajv validator                      |
| `@attest/diff`         | Unified diff parser (line-level hunks, file operations)           |
| `@attest/symbols`      | Language-agnostic symbol extraction (TypeScript, Python, Go)      |
| `@attest/core`         | Verifier orchestration, undeclared-changes detector               |
| `@attest/runner`       | Outcome execution (worktree isolation, command resolution)        |
| `@attest/cli`          | `attest verify` command                                           |
| `@attest/detectors-ts` | TypeScript authentication detector (demoted, opt-in, best-effort) |

## Corpus (regression oracle)

The `corpus/` directory contains 13 cases across TypeScript, Python, and Go that exercise the full verification pipeline. These cases are the regression oracle: a change that breaks an oracle case is wrong by definition (SPEC §10).

Run the corpus acceptance test:

```bash
pnpm --filter @attest/cli test -- corpus.test.ts
```

See `corpus/README.md` for details.

## License

Apache-2.0
