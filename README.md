# attest

> Closes the gap between what an AI coding agent claims it changed and what it actually changed.

`attest` is a deterministic, locally-runnable CLI tool. An AI agent emits a structured JSON manifest describing its changes; `attest verify` checks each claim against the actual diff and produces a structured verdict. No LLM in the verification path. No SaaS dependency. MIT licensed.

## Install (v0.1 — repo-local)

```bash
git clone https://github.com/ree2raz/attest
cd attest
pnpm install
pnpm build
```

## Basic usage

```bash
attest verify \
  --manifest path/to/manifest.json \
  --diff path/to/changes.diff \
  --repo-root /path/to/repo
```

Output:
```
🤖 Agent: claude-code (claude-opus-4-7) · 5 tool calls · 1 files touched
📝 Task: Add login endpoint

📋 Declared changes (2):
  ✅ c1  endpoint POST /login in src/routes/auth.ts
  ❌ c2  no auth in chain at src/routes/auth.ts:POST /login

🔍 Reviewer focus:
  1. c2 failed — authentication not detected
```

Exit 0 = all claims verified + zero undeclared changes. Exit 1 = something needs human attention.

## Manifest format

See [docs/SCHEMA_V0.1.md](docs/SCHEMA_V0.1.md) for the full manifest specification.

## Known limitations (v0.1)

- Cross-file middleware definitions are classified by name/import only — the body is not followed across files.
- NestJS global guards (`APP_GUARD`, `useGlobalGuards`) are always flagged as `partial`, not `verified`.
- Custom framework abstractions that wrap Express/Fastify/etc. will produce `framework_unsupported`.
- Syntactic analysis only — no type inference, no runtime execution.
- Only the `authentication` behavioral property is detected in v0.1. All others return `unverifiable` / `detector_not_implemented`.

## Packages

| Package | Description |
|---|---|
| `@attest/schema` | JSON Schema, TypeScript types, ajv validator |
| `@attest/core` | Verifier orchestration, diff parser, undeclared-changes detector |
| `@attest/detectors-ts` | TypeScript authentication detector |
| `@attest/cli` | `attest verify` command |
