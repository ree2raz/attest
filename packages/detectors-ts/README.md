# @attest/detectors-ts

> **Best-effort, non-deterministic, not part of the core verdict — do not use in CI gates.**

This package is the demoted, opt-in, advisory plugin layer from SPEC §6.5. It
is **not** the structural verifier (that's `@attest/core` + `@attest/symbols`)
and it has **no path into `verdict.exit_code`**. Nothing in `@attest/cli` or
`@attest/core` calls it. It exists for one purpose: when a human is reviewing
a change, the heuristics here can flag _likely_ auth signals so the reviewer
doesn't have to re-read the middleware chain by eye.

## When to use

- Review-time aid: "did this change add or remove auth middleware on a route?"
- Authoring a manifest: "which routes in this file should I claim an outcome for?"
- Spikes and demos: a quick read of the auth shape of a small diff.

## When **not** to use

- CI gating. Never branch a build on a `DetectorOutput`. The advisories are
  heuristics over name matches, import origins, and body patterns — they have
  false positives and false negatives in both directions.
- Compliance / audit. This is the opposite of the regulator-presentable
  provenance record `@attest/audit` will emit in Phase 3.
- Languages other than TypeScript/JS. The detector only parses `.ts`/`.tsx`/
  `.js`/`.jsx`/`.mts`/`.cts`/`.mjs`/`.cjs`. Py/Go detectors are deliberately
  not in scope (SPEC §6.5: "do not invest further in per-framework coverage").

## API

```ts
import { runDetectors, type DetectorOutput } from "@attest/detectors-ts";
import { parseDiff } from "@attest/diff";

const diff = parseDiff(unifiedDiffText);
const advisories: DetectorOutput[] = await runDetectors({
  diff,
  repoRoot: process.cwd(),
});

// `advisories` is read-only human-signal. Logging it is fine.
// Using it to compute an exit code is not — that is `@attest/core`'s job.
```

### `runDetectors(input: DetectorInput): Promise<DetectorOutput[]>`

Scans every non-deleted source file in the diff, enumerates routes, and
emits one `DetectorOutput` per route. File reads default to
`readFile(join(repoRoot, path))`; pass `input.readFile` to inject content
(e.g. from a worktree) or to test in-memory.

### `detectAuthentication(input: AuthenticationInput): Promise<DetectorOutput>`

Lower-level helper. Run a single `(path, symbol, content)` triple through
the auth heuristic. Useful for unit tests and for power users who already
know which routes they care about.

### `findRoutesInFile(path, content): string[]`

Pure: enumerate route symbols in a file. Returns strings in the shape
`"POST /x"` (Express/Fastify/Koa/raw-Node) or `"ClassName.methodName"`
(NestJS) — the same shape `chain.ts` consumes.

### `DETECTOR_WARNINGS`

A `readonly string[]` carried on every `DetectorOutput.warnings`. Surface it
in your CLI/log output so the advisory nature is always visible.

## Status semantics

`DetectorOutput.status` is one of three advisory values — never `verified` /
`failed` / `unverifiable`, which belong to the closed verdict taxonomy
(SPEC §4.2).

| Status                  | Meaning                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `advisory_present`      | The heuristic found an auth signal in this route's chain.                                      |
| `advisory_absent`       | The heuristic found no auth signal.                                                            |
| `advisory_inconclusive` | The heuristic could not decide (unknown middleware, unsupported framework, parse error, etc.). |

The same `reason_code` vocabulary from the v0.1 detector is preserved on
each output: `no_auth_in_chain`, `no_route_found`, `unknown_middleware_only`,
`framework_unsupported`, `parse_error`. Downstream tooling that read these
reason codes can keep working.

## Supported frameworks

`chain.ts` recognises the following — anything else short-circuits to
`advisory_inconclusive` with `framework_unsupported`.

- **Express** — `app.METHOD(path, mw, …, handler)` and `app.use(mw)`
- **Fastify** — `app.METHOD(path, opts, handler)` with `preHandler` /
  `onRequest` / `preValidation`, plus `app.addHook("onRequest" | …, mw)`,
  plus `app.route({ method, url, … })`
- **Koa** — `app.use(mw)` and `router.METHOD(path, mw, …, handler)`
- **NestJS** — `@Controller` classes with `@Get`/`@Post`/`@Put`/`@Delete`/
  `@Patch`/`@Options`/`@Head`/`@All` methods, including class-level and
  method-level `@UseGuards`
- **Raw Node** — `req.method === "X" && req.url === "/y"` branches in an
  `http.createServer((req, res) => …)` callback (Layer 3 body pattern only;
  no in-parser AST walk)

## Classification layers

Middleware names and imports are classified by `classify.ts` in three layers
(Layer 1: name match; Layer 2: import origin; Layer 3: body pattern). These
heuristics are deliberately simple — they look for the names typical of
auth middleware (`auth`, `requireAuth`, `passport.authenticate`, etc.) and
the packages typical of auth (`passport`, `@nestjs/passport`, `jose`, …).
Real codebases can fool them in both directions.

## Adding a new property (contributor guide)

See the slimmed section in `CONTRIBUTING.md`. The hook point is
`runDetectors`: every `DetectorOutput` is annotated with `detector: <name>`,
and the public surface is `runDetectors({ diff, repoRoot })`. Do **not**
re-introduce semantic verdicts — only advisories.

## History

- **v0.1** (WUs before WU8) — verification-path plugin, exported
  `registerDetectors()` consumed by the v0.1 CLI. Built against the v0.1
  `Claim` shape (`target.kind: "endpoint"`, `verification_contract`).
- **v0.2** (WU8, SPEC §6.5) — demoted to opt-in advisory. New public
  surface: `runDetectors`, `detectAuthentication`, `findRoutesInFile`.
  No `Claim` dependency, no `Detector` interface, no `registerDetectors()`.
  Carries `warnings` on every output. Has no path into `verdict.exit_code`.
