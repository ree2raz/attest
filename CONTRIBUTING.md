# Contributing to attest

## How to add a detector property

`@attest/detectors-ts` is the demoted, opt-in, advisory plugin layer (SPEC §6.5).
It is **not** part of the verdict path: nothing in `@attest/core` or
`@attest/cli` calls it, and `verdict.exit_code` is never computed from its
output. A "detector" here means a best-effort advisory that surfaces a
human-signal in review.

1. Create `packages/detectors-ts/src/<property>/` directory.
2. Implement a function returning `DetectorOutput` — never a verdict. The
   public type lives in `packages/detectors-ts/src/types.ts`:
   - `status: "advisory_present" | "advisory_absent" | "advisory_inconclusive"`
   - `warnings` is always `DETECTOR_WARNINGS` so the advisory nature is visible
3. Add per-framework modules following the pattern in
   `src/authentication/{framework,chain,classify}.ts`.
4. Wire your property into `runDetectors` (`src/run-detectors.ts`). Add a
   `findRoutesInFile`-like enumerator for whatever targets the property cares
   about, then call your function per target.
5. Export your function from `src/index.ts` and tag every output's `detector`
   field with a stable, lowercased identifier (e.g. `"authentication"`).
6. Write a fixture suite following the instructions below — minimum 4 fixtures
   per framework supported.
7. Ensure `pnpm --filter @attest/detectors-ts test` exits 0 with ≥85% line
   coverage on your new module.

> **Hard rule:** never let your detector's output flow into a
> `ClaimResult.status` (`verified` / `failed` / `unverifiable`). Those three
> values are owned by `@attest/core` and form the closed verdict taxonomy
> (SPEC §4.2). Re-introducing semantic verdicts at the detector layer is what
> killed the v0.1 attempt — do not do it.

## How to add a fixture

Fixtures live in `packages/detectors-ts/fixtures/<property>/`.

1. Create `<fixture-name>.ts` — a minimal TypeScript file that exercises the
   specific case.
2. Create `<fixture-name>.expected.json` with the expected advisory shape:
   ```json
   {
     "verdict": "verified",
     "reason_code": null,
     "evidence_contains": ["authMiddleware", "Layer 1"]
   }
   ```
   The `verdict` field is the v0.1 vocabulary — it is translated to the
   current `DetectorStatus` at test time (`verified`→`advisory_present`,
   `unverified`→`advisory_absent`, `partial`→`advisory_inconclusive`).
   `evidence_contains` is an array of strings — each must appear in at least
   one evidence entry's `note`.
3. Run `pnpm --filter @attest/detectors-ts test` and confirm the new fixture
   passes.
4. Never mark fixtures as "todo" or skip them. Every fixture must pass before
   merging.

## Commit conventions

Follow conventional commits: `feat(scope): message`, `fix(scope): message`,
`test(scope): message`.

Scope is the package short name: `schema`, `core`, `detectors-ts`, `cli`.

Examples:

- `feat(schema): add ajv validator`
- `test(detectors-ts): add express fixtures`
- `fix(core): handle deleted files in undeclared detection`

One logical change per commit. No "WIP" commits on main.

## Running the full suite

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
```

All four must exit 0 before a PR is mergeable.
