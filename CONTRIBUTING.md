# Contributing to attest

## How to add a detector

1. Create `packages/detectors-ts/src/<property>/` directory.
2. Implement the detector class implementing the `Detector` interface from `detector.ts`.
3. Add per-framework modules following the pattern in `src/authentication/`.
4. Register your detector in `registerDetectors()` in `src/detector.ts`.
5. Write a fixture suite following the instructions below — minimum 4 fixtures per framework supported.
6. Ensure `pnpm --filter @attest/detectors-ts test` exits 0 with ≥85% line coverage on your new module.

## How to add a fixture

Fixtures live in `packages/detectors-ts/fixtures/<property>/`.

1. Create `<fixture-name>.ts` — a minimal TypeScript file that exercises the specific case.
2. Create `<fixture-name>.expected.json` with the expected verdict:
   ```json
   {
     "verdict": "verified",
     "reason_code": null,
     "evidence_contains": ["authMiddleware", "Layer 1"]
   }
   ```
   `evidence_contains` is an array of strings — each must appear in at least one evidence entry's `note`.
3. Run `pnpm --filter @attest/detectors-ts test` and confirm the new fixture passes.
4. Never mark fixtures as "todo" or skip them. Every fixture must pass before merging.

## Commit conventions

Follow conventional commits: `feat(scope): message`, `fix(scope): message`, `test(scope): message`.

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
