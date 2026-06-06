# attest

> Closes the gap between what an AI coding agent claims it changed and what it actually changed.

`attest` is a deterministic, locally-runnable CLI tool. An AI agent emits a structured JSON manifest describing its changes; `attest verify` checks each claim against the actual diff and produces a structured verdict. No LLM in the verification path. No SaaS dependency. Apache-2.0 licensed.

## What attest does — and what it deliberately does not

attest verifies **that** an agent did what it claimed — structurally, and that the declared build/test/lint commands actually ran and passed. That's the whole promise, and it's a deterministic one.

What it does **not** do, by design:

- **It does not judge whether the code is correct or good.** attest can confirm a test was added and that the suite passes. It cannot tell you the test is _meaningful_ — an agent that writes `test('login', () => assert(true))` alongside a passing suite will verify clean. Semantic correctness is delegated to human review or LLM review tools (CodeRabbit, Greptile). This is a boundary, not a bug: it's what keeps the verdict deterministic.
- **It does not answer behavioral or security claims.** "Auth is enforced on every route," "inputs are validated," "no SQL injection" are semantic. attest returns `unverifiable` with a pointer to review — never a heuristic guess.
- **No LLM, no SaaS, no telemetry, no required network calls.** Determinism is the product.

In one line: **attest guarantees structural compliance and execution success; it delegates semantic correctness to the operator.** See [SPEC §2](docs/SPEC.md) for the full scope boundary.

## 20-minute zero-to-first-verdict

### 1. Install

The CLI is `npx`-installable as `@attest/cli` (Node ≥ 20):

```bash
npx @attest/cli --version
```

Or build from source:

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

## Generating a manifest from a diff

If you have the diff but no manifest yet, `attest init` produces a deterministic
skeleton from the diff + your worktree state. The skeleton is the same on
every machine, byte-for-byte (modulo `task.description` and `agent.id`, which
you fill in):

```bash
attest init --diff change.diff --repo-root . --out .attest/manifest.json
```

What the skeleton contains:

- One `file_change` claim per touched file (op derived from the diff).
- One `symbol_added` / `symbol_removed` / `symbol_modified` per symbol that
  tree-sitter sees in the post file vs the pre file (`git show HEAD:<path>`).
- One `test_added` / `test_modified` per test file the diff touches (matched
  by path: `tests/`, `__tests__/`, `spec/`, `.test.*`, `.spec.*`).
- `declared_scope.files` is the full set of touched paths.
- No `outcome` claims — those require actually running the build/test, which
  is what `attest verify` does.

After `init`, you fill in `task.description`, `agent.model`, and any
`outcome` checks you want enforced, then run `attest verify`.

For the full agent-facing contract — the closed claim taxonomy, the
`declared_scope` rule, the exit code table, and a minimal example — see
[docs/manifest-contract.md](docs/manifest-contract.md). Paste that file into
your agent's instructions verbatim.

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

## Security model (read before you run it on untrusted code)

To verify `outcome` claims, attest **executes** your declared build/test/lint commands. Executing commands means running code — including any package lifecycle scripts (`postinstall`, `prepare`) that code pulls in.

In Phase 1, isolation is a clean **`git worktree`**, not a container or VM. That isolates the _filesystem checkout_ so commands never touch your live working tree — it does **not** sandbox the _process_. Commands run with your user's full privileges, network access, and environment.

The supported usage, therefore, is: **run attest on your own change**, locally or in your own CI — the same place you'd already run these tests. Do **not** point attest at a manifest and diff from an agent or third party you don't trust on a machine you care about; a malicious `test_cmd` or a poisoned dependency would execute on your host. Treat the runner exactly like `npm test`: it is only as trusted as the code you aim it at.

Container/VM isolation for executing genuinely untrusted code is a later-phase item ([SPEC §6.4](docs/SPEC.md), §8). Until it lands, attest is a verification gate for code you were going to run anyway — not a sandbox for code you weren't.

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

The `corpus/` directory contains 21 cases across TypeScript, Python, and Go that exercise the full verification pipeline. These cases are the regression oracle: a change that breaks an oracle case is wrong by definition (SPEC §10).

Run the corpus acceptance test:

```bash
pnpm --filter @attest/cli test -- corpus.test.ts
```

See `corpus/README.md` for details.

## License

Apache-2.0
