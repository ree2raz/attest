# Community seed — copy-paste for posting in the agent communities

Drop the version of this post that matches your community, with no edits
needed. The angle is the same: **the gap between what the agent says it
did and what it actually did is a real, fixable problem, and the fix is
structural, not "better prompting."**

---

## Cursor community (Discord, r/Cursor, forum.cursor.sh)

> Cursor has been writing more of my day-to-day changes, and I've been
> getting bitten by the "agent said it shipped login() and logout(); the
> diff only has login()" class of bug. I built a small CLI to catch this
> structurally — `npx @attest/cli verify` reads a JSON manifest Cursor
> emits (or that `attest init` produces from a diff) and checks every
> claim against the actual diff and the worktree. No LLM in the path —
> tree-sitter extracts symbols, ajv validates the manifest, the verdict
> is deterministic. The interesting design choice is what it refuses to
> do: it never answers "is this code correct?" — those claims come back
> as `unverifiable` with a reviewer pointer. Determinism is the product.
>
> - Repo: https://github.com/ree2raz/attest
> - `npx @attest/cli` (Node 20+)
> - GitHub Action: `uses: ree2raz/attest@v1`
> - The thing to read first if you're integrating it: docs/manifest-contract.md

---

## Claude Code community (Discord, r/ClaudeAI, Anthropic forum)

> The thing I keep wanting from Claude Code in agent mode is a hard
> check that the work matches the claim. I just shipped a small CLI
> that does this structurally — `npx @attest/cli verify` checks every
> claim in a manifest against the diff and the worktree. The closed
> claim taxonomy (file_change, symbol_added, symbol_modified,
> test_added, outcome) is a single source of truth in
> `@attest/schema`. The thing it deliberately does not do is judge
> semantic correctness — a claim that auth is enforced on every
> route returns `unverifiable` with a reviewer pointer, not a
> heuristic verdict. You can pipe Claude Code's `tool_calls` into
> `attest init` to bootstrap a manifest, then enforce it in CI with
> the GitHub Action (`ree2raz/attest@v1`).
>
> Repo: https://github.com/ree2raz/attest

---

## Aider community (Discord, r/Aider)

> Aider's commit messages are good, but a commit message is prose; I
> wanted a structural check. So I wrote `attest` — a tiny CLI that
> reads a JSON manifest (you can have Aider emit it via a custom
> command, or run `attest init` to generate one from the diff) and
> verifies every claim against the worktree with tree-sitter for
> symbol extraction and ajv for the manifest schema. No LLM in the
> path. The "did you also undeclare a file?" class of bug — Aider
> edited three files, the manifest listed two — is caught by the
> `declared_scope` rule and exits 1 with a specific undeclared path
> in the verdict. GitHub Action version is in the README.
>
> Repo: https://github.com/ree2raz/attest

---

## r/MachineLearning and r/LocalLLaMA (the "I trust nothing" angle)

> If you're letting an LLM agent edit your repo, the structural claim
> "I added X" is an LLM claim — and LLM claims need LLM-free
> verification, otherwise you've built a system that checks itself.
> I built `attest` to be that check: it reads a JSON manifest, runs
> ajv against the schema, runs tree-sitter against the post file, and
> reconciles the two. The verifier is 100% deterministic code. The
> thing I want to flag is what it deliberately doesn't do: there's
> no "is the code good?" judgment. Those claims are
> `unverifiable` with a reviewer pointer. I think the agent-eats-itself
> tail risk is real enough that this boundary is worth defending.
>
> Repo: https://github.com/ree2raz/attest

---

## Hacker News (terser, link-only)

> I built `attest` because I was getting tired of "the agent said it
> shipped X" turning into "it shipped X minus one import and the test
> was a tautology." It checks a JSON manifest against a diff with no
> LLM in the path — tree-sitter, ajv, the worktree. Determinism is
> the product; semantic claims come back as `unverifiable` with a
> reviewer pointer. `npx @attest/cli`, GitHub Action included. TypeScript,
> Python, Go first-class. Apache-2.0.
>
> https://github.com/ree2raz/attest

---

## Posting tips

- **Lead with the bug you've been bitten by**, not the product. "The
  agent said X, the diff said not-X" is a story everyone in these
  communities has lived.
- **Don't oversell the determinism boundary.** Saying "no LLM, ever"
  reads as a feature, but the actual claim is smaller: _the verification
  path_ has no LLM. The agent can be an LLM; the manifest it produces
  is a fixed-schema JSON document; the verifier is pure code.
- **Link the manifest contract doc, not the README.** The README is a
  tour; the contract is the paste-in. People integrating an agent
  want the paste-in.
- **Don't lead with security/provenance framing.** That is a different
  conversation and a different audience. The "gap between claim and
  reality" framing is the one this community cares about.
