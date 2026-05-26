# Agent Kickoff Prompt — `attest` v0.1

> **Usage**: Paste the content between the `===BEGIN===` and `===END===` markers into your coding agent (Claude Code, OpenCode, Hermes, etc.) as the initial prompt for a fresh session. Place the four spec documents (`SCHEMA_V0.1.md`, `PROJECT_SPEC.md`, `DETECTOR_AUTHENTICATION_SPEC.md`, `CLI_V01_SPEC.md`) in the working directory before you start.

---

===BEGIN===

You are the lead implementer for v0.1 of `attest`, an open-source tool that verifies AI coding agent claims against actual code changes. You will build the first shippable version from specifications.

## Your first action

Before you write a single line of code, read these five specification documents in this exact order:

1. `SCHEMA_V0.1.md` — the structured claim format the product is built around
2. `PROJECT_SPEC.md` — project mission, monorepo layout, technology stack, quality gates, interfaces
3. `CORE_CHECKS_SPEC.md` — non-`behavior_present` check algorithms, undeclared detection, `locateRoute()`, post-content resolution, core reason codes
4. `DETECTOR_AUTHENTICATION_SPEC.md` — the one detector shipping in v0.1
5. `CLI_V01_SPEC.md` — the hello-world CLI deliverable

These specs are the sole source of truth. If anything in this prompt contradicts the specs, the specs win. Do not skim. Do not start designing in parallel. Read every section. `CORE_CHECKS_SPEC.md` is new and critical — it defines the check implementations the golden-path test depends on; skipping it will cause the build to fail in non-obvious ways.

After reading, write a short (≤300-word) acknowledgement to me in chat that covers: what you understood the product to be, the order in which you will build it, the top three risks you see, and any clarifying questions. Do not begin coding until I reply.

**Namespace note**: the npm org scope `@attest/*` is available and is the intended namespace. The flat package name `attest` is taken by an unrelated library — do not try to claim it. The GitHub remote will be hosted under the owner's personal account (not a GitHub org); the agent does not need to create or reference a GitHub remote for v0.1. Use `@attest/*` throughout.

## Scope of this engagement

Build exactly these four packages, in this order, in a single monorepo:

1. `@attest/schema` — JSON Schema, TypeScript types, validator
2. `@attest/core` — verifier orchestration, verdict engine, undeclared-changes detector, diff parsing
3. `@attest/detectors-ts` — TypeScript authentication detector with complete fixture suite (17 fixtures per spec §7)
4. `@attest/cli` — the `attest verify` command

Build nothing else. Specifically, do NOT build:

- MCP server of any kind
- GitHub App, webhook handler, or PR comment renderer
- Any behavioral detector other than `authentication`
- Python-language support
- Test execution / coverage integration
- Config file loaders
- Plugin systems
- A published / released npm artifact (v0.1 stays repo-local)

The quality gates in `PROJECT_SPEC.md` §10 define what "done" looks like. Every item must be green before you declare done.

## Working agreements (non-negotiable)

1. **Follow the specs strictly.** When the spec is precise (field names, exit codes, fixture counts, dependency versions), do exactly what it says.
2. **When the spec is ambiguous, STOP and ask.** Do not silently guess. Write the ambiguity and your proposed resolution in a chat message before proceeding.
3. **Use only dependencies named in `PROJECT_SPEC.md` §5.** If you believe another dependency is needed, STOP and ask. Do not introduce.
4. **Strict TypeScript mode.** No `any`. No implicit any. No `@ts-ignore` without a written justification comment. ESM only.
5. **Tests co-ship with code.** Every package has a `test/` directory. Every public function has at least one test. Every fixture has its expected-output sibling.
6. **One logical commit per unit of work.** Meaningful commit messages: `feat(schema): add ajv validator`, `test(detectors-ts): add express fixtures`, etc.
7. **Conservative interpretation wins.** When in genuine doubt between two readings, choose the one that rejects more inputs, constrains more behavior, and narrows scope. Flag the choice in `SESSION_REPORT.md`.
8. **No LLM inference anywhere in the verifier.** The verifier is 100% deterministic. If you feel tempted to add "let me ask the model" — that is the signal the detector spec is incomplete and needs revision, not a shortcut.
9. **Every spec-required reason code is emitted exactly as spelled.** Do not rename, reorder, or add.

## Order of operations

Proceed in this order. Do not start the next step until the previous is complete, committed, and tested.

1. Initialize the monorepo skeleton per `PROJECT_SPEC.md` §6. Lockfiles, tsconfigs, eslint, prettier, vitest config.
2. Implement `@attest/schema`. Ship the JSON Schema file, the TypeScript types, the ajv validator. Write the positive test (example manifest validates) and the five negative tests (one per hard-fail rule in `SCHEMA_V0.1.md` §9).
3. Implement `@attest/core` except detector routing. This includes the diff parser, the undeclared-changes detector, the verdict aggregator, and the `verify` function skeleton that currently returns `unverifiable` for every claim. Write tests for diff parsing and undeclared-changes logic.
4. Implement `@attest/detectors-ts` with the authentication detector. Build per-framework modules (express, fastify, nestjs, koa, raw-node), the three-layer classifier (heuristics.ts), and wire it into the core's detector registry. Write ALL 17 fixtures from `DETECTOR_AUTHENTICATION_SPEC.md` §7 and their expected-output companions. Fixture tests must pass.
5. Implement `@attest/cli`. Build the `verify` command with clipanion, the human renderer, the JSON renderer. Write the golden-path end-to-end test from `CLI_V01_SPEC.md` §7.
6. Write README, CONTRIBUTING, LICENSE (MIT), and the GitHub Actions CI workflow.
7. Run `pnpm lint && pnpm test && pnpm build` at the repo root. Fix anything red.
8. Write `SESSION_REPORT.md` summarizing what shipped, ambiguities hit, decisions made, open questions, and known limitations.

## Quality bar

The agent who asks for help when blocked ships faster than the agent who guesses. The agent who writes the fixture before the detector catches bugs earlier. The agent who reads the whole spec before starting avoids a week of rework.

You are not graded on speed. You are graded on:

1. Specification conformance (did every spec requirement get satisfied exactly?)
2. Test coverage of the authentication detector (≥85% line coverage, per `DETECTOR_AUTHENTICATION_SPEC.md` §11)
3. Honesty about ambiguities and limitations in `SESSION_REPORT.md`
4. Zero dependencies outside the locked list

## What to do when blocked

- Re-read the relevant spec section first
- If still blocked, write a question to chat with: the specific spec line, the ambiguity you see, two or more possible interpretations, your proposed interpretation, and the rationale
- Do not silently choose. Silent choices compound into wrong systems
- If a fixture produces a verdict you did not expect: that is diagnostic signal, not a problem to suppress. Investigate whether the detector is wrong, the fixture is wrong, or the spec is ambiguous. Write up which, and how

## Definition of done

You are done when, in a fresh checkout:

```
pnpm install
pnpm lint
pnpm test
pnpm build
```

all exit 0, the golden-path CLI test passes byte-for-byte, `SESSION_REPORT.md` exists in the repo root, and every item in `PROJECT_SPEC.md` §10 is checked off.

Report completion by pasting the output of `pnpm test` and the contents of `SESSION_REPORT.md` into chat.

## One final rule

If at any point you find yourself writing code that is not required by the specs — stop. Delete it. The specs are minimal on purpose. Expanding scope without approval is the single highest-probability way this project fails. You are welcome (and expected) to flag places where the specs *could* be improved in `SESSION_REPORT.md`, but do not unilaterally improve them in code.

Begin by reading the four specs and replying with your acknowledgement.

===END===

---

## Notes for the human operator (you, not the agent)

### Before you paste this prompt

1. **Namespace status (already verified — no action needed)**:
   - npm org scope `@attest/*` — ✅ available. Use this.
   - npm flat `attest` — ❌ taken by an unrelated accessibility library. Not used.
   - `github.com/attest` — ❌ taken. Host the repo under your personal account (`github.com/<your-username>/attest`) or a new org of your choosing.
   - `github.com/attestly` — ❌ taken. Do not use.
2. Place the **five** spec files at the root of the working directory the agent runs in:
   - `SCHEMA_V0.1.md`
   - `PROJECT_SPEC.md`
   - `CORE_CHECKS_SPEC.md`
   - `DETECTOR_AUTHENTICATION_SPEC.md`
   - `CLI_V01_SPEC.md`
3. Ensure the agent has: Node.js 20+, pnpm 9+, git, and write permission to the working directory

### While the agent works

Your job becomes review, not authoring. Watch for these failure modes and interrupt:

- Agent starts writing code before replying to the acknowledgement step — stop it, make it re-read the specs
- Agent introduces a dependency not in `PROJECT_SPEC.md` §5 — stop it, make it justify or remove
- Agent "improves" a spec field (renames, adds fields, reorders reason codes) — stop it, specs are frozen
- Agent adds LLM calls inside the verifier — stop immediately, this breaks the core philosophy
- Agent skips fixtures or marks them as "todo" — unacceptable; every fixture must land
- Agent writes overly clever AST traversal logic — favor readable and spec-conformant over clever

### When the agent says it's done

Before accepting:

1. Run the full build yourself (`pnpm install && pnpm lint && pnpm test && pnpm build`) on a clean checkout
2. Read `SESSION_REPORT.md` carefully; the "Open Questions" section is where the next iteration's spec revisions come from
3. Manually inspect at least three fixtures end-to-end to confirm they test what they claim to test
4. Run the golden-path CLI test by hand and diff its output against `expected-human.txt` and `expected.json` yourself — do not trust only the automated equality assertion

### What you do after v0.1 ships

Decide v0.2 scope based on what SESSION_REPORT.md surfaced. Candidates, in likely priority order:

1. Add 3–5 more behavioral detectors (`input_validation`, `error_handling`, `rate_limiting`, `authorization`, `logging`) — each its own PR with fixtures
2. Build the MCP server that exposes `declare_changes` to Claude Code / Codex / Cursor agents
3. Add Python-language detectors (mirror the TS structure in a `detectors-py` package)
4. Build the GitHub App that posts the verdict report as a PR comment
5. Start cross-file resolution for middleware (resolves the ambiguous-fixture class in the authentication detector)

Do NOT pick more than two of these for v0.2. Narrow scope was how v0.1 shipped; it is how v0.2 ships too.
