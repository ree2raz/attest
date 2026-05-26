# Architecture — attest v0.1

## Overview

```
manifest.json + changes.diff
        │
        ▼
  @attest/cli  (attest verify)
        │
        ├── validates manifest via @attest/schema
        ├── parses diff via @attest/core (parse-diff)
        └── calls core.verify()
                 │
                 ├── undeclared.ts  — computes (diff_paths ∪ files_touched) − declared_files
                 ├── checks/        — symbol_exists, removed, test_covers, signature_matches
                 │       └── locate-route.ts  — shared route finder (used by checks + detectors)
                 └── detector registry
                         └── @attest/detectors-ts
                                 └── authentication/
                                         ├── express.ts
                                         ├── fastify.ts
                                         ├── nestjs.ts
                                         ├── koa.ts
                                         └── raw-node.ts
```

## Package dependency graph

```
@attest/schema   →  (no internal deps)
@attest/core     →  @attest/schema
@attest/detectors-ts  →  @attest/core, @attest/schema
@attest/cli      →  @attest/schema, @attest/core, @attest/detectors-ts
```

No circular dependencies. Each package imports only the public `index.ts` of its dependencies.

## Key design decisions

**Deterministic only.** The verifier never calls an LLM. Every verdict is reproducible from the same inputs.

**Read-from-disk, not diff-apply.** Post-diff content comes from reading the file at `repoRoot/path`. The diff is used only to enumerate changed files. This avoids a patch-apply dependency and works naturally with any checkout-based workflow.

**`locateRoute()` is shared.** Both `symbol_exists` checks on endpoint targets and the authentication detector use the same route-location logic, exported from `@attest/core`. No duplication.

**Evidence is pedagogical.** The reviewer should learn *why* the verdict is what it is, not just *what* it is. Every chain member classification is reported with the layer that matched it.

**`reviewer_focus` is the primary human output.** The full claim list is for completeness; the focus section tells the reviewer exactly where to look. It is omitted only when every claim is `verified` and there are zero undeclared findings.
