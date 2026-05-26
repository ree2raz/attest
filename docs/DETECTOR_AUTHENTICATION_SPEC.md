# Detector Specification: `authentication`

Status: **Ready for implementation.**
Package: `@attest/detectors-ts`
Module: `src/authentication/`
Companion: `PROJECT_SPEC.md`, `SCHEMA_V0.1.md`

---

## 1. Purpose

Given a TypeScript source file and a target symbol representing an HTTP route or endpoint handler, determine whether the target is protected by an authentication check before its business logic executes.

This detector implements the `behavior_present` check when `verification_contract.params.property === "authentication"`.

The detector does **not** decide whether authorization is correct, whether the auth mechanism is secure, or whether the token format is right. It decides one thing: is there *any* auth check gating the handler.

---

## 2. Interface

```ts
import type { Claim } from "@attest/schema";
import type { DetectorContext, DetectorVerdict } from "@attest/detectors-ts";

export async function detectAuthentication(
  claim: Claim,
  ctx: DetectorContext
): Promise<DetectorVerdict>;
```

**Accepts** a claim where:
- `type` is `"modify_behavior"` or `"add_symbol"`
- `target.kind` is `"endpoint"` (required for auth — only endpoints can be "protected")
- `target.path` is a TypeScript file in the repo
- `target.symbol` is an endpoint identifier. Format: `"METHOD /path"` for Express/Fastify/Koa/raw Node; `"ClassName.methodName"` for NestJS
- `verification_contract.check` is `"behavior_present"`
- `verification_contract.params.property` is `"authentication"`

**Rejects** (returns `unverifiable` with reason `invalid_claim_shape`) any claim that does not meet all of the above.

---

## 3. Supported frameworks (v0.1)

| Framework     | Versions | How endpoints are registered                                              |
|---------------|----------|----------------------------------------------------------------------------|
| Express       | 4.x, 5.x | `app.METHOD(path, ...middleware, handler)` or `router.METHOD(...)`         |
| Fastify       | 4.x      | `fastify.METHOD(path, { preHandler, handler })` or `fastify.route({...})`  |
| NestJS        | 10.x     | Controller class + method decorators (`@Get`, `@Post`, etc.)               |
| Koa           | 2.x      | `app.use(...)` chain + `@koa/router` `router.METHOD(...)`                  |
| Raw Node HTTP | N/A      | `http.createServer((req, res) => {...})` with in-handler routing           |

Framework detection is automatic based on imports and API shape. An explicit `framework` hint is not supported in v0.1.

---

## 4. Algorithm (language-agnostic steps)

1. **Parse** `target.path` with `ts-morph`. If parse fails → return `unverifiable` with reason `parse_error`.
2. **Detect framework** by scanning top-of-file imports (see §4.1). If no recognized framework → return `unverifiable` with reason `framework_unsupported`.
3. **Locate target registration** corresponding to `target.symbol` (see §4.2). If not found → return `unverified` with reason `no_route_found`.
4. **Collect the middleware/guard/hook chain** that runs before the handler body (see §4.3, per-framework).
5. **Classify each chain entry** as `auth`, `not-auth`, or `unknown` using the three-layer heuristic in §5.
6. **Compute verdict** per §6.

### 4.1 Framework detection — import signatures

Scan all `import` declarations in the file. The *first* match (in the order below) wins:

| Import source                                            | Framework     |
|-----------------------------------------------------------|---------------|
| `express`                                                 | Express       |
| `fastify`                                                 | Fastify       |
| `@nestjs/common`, `@nestjs/core`                          | NestJS        |
| `koa`, `@koa/router`                                      | Koa           |
| `http`, `https`, `node:http`, `node:https`                | Raw Node      |

If the file contains no such imports, the detector walks *up* one level: if a default or named export from this file is consumed by a sibling file that imports `express` etc., that framework applies. In v0.1, this upward resolution is **not implemented** — if the file itself does not import the framework, return `framework_unsupported`.

### 4.2 Target registration — per-framework location

**Express / Koa with `@koa/router`**: `target.symbol` is `"METHOD /path"`. Match by finding a CallExpression where:
- The callee is `<identifier>.<method>` where method matches `get|post|put|delete|patch|options|head|all|use`
- The first argument is a string literal equal to `/path`
- The method (lowercased) equals the METHOD token

**Fastify**: match either:
- `fastify.<method>("/path", ...)` — same pattern as Express
- `fastify.route({ method: "METHOD", url: "/path", ... })` — an ObjectLiteralExpression where `method` and `url` properties match

**NestJS**: `target.symbol` is `"ClassName.methodName"`. Match by finding:
- A ClassDeclaration named `ClassName` decorated with `@Controller(...)`
- A MethodDeclaration within it named `methodName` decorated with one of `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`, `@Options`, `@Head`, `@All`

**Raw Node**: match the handler function inside `http.createServer(HANDLER)`. If `target.symbol` is `"METHOD /path"`, the detector looks inside the handler body for an `if` branch whose condition matches `req.method === "METHOD"` and `req.url === "/path"` (or a matching regex). The middleware chain is the set of statements executed before entering that branch.

### 4.3 Middleware/guard/hook chain collection — per-framework

**Express**:
1. Inline chain: all arguments between the path and the final argument in `app.METHOD(path, ...middleware, handler)` are inline middleware
2. Router-level: if the route lives on a `Router` instance, collect all `router.use(...)` calls *above* the route registration in source order
3. App-level: collect all `app.use(pathOrMiddleware, ...)` calls above the `app.METHOD` call. If `app.use` has a path prefix, it applies only if the route path starts with that prefix
4. Concatenate in order: app-level → router-level → inline → handler

**Fastify**:
1. Route-options: if the route is registered via `{ preHandler, onRequest, preValidation }`, these are the inline hooks (in the order `onRequest` → `preValidation` → `preHandler`)
2. Global hooks: `fastify.addHook("onRequest"|"preValidation"|"preHandler", fn)` calls *above* the route registration
3. Concatenate: global hooks → route-options hooks → handler

**NestJS**:
1. Method-level guards: `@UseGuards(...)` on the method
2. Class-level guards: `@UseGuards(...)` on the controller class
3. Global guards: `APP_GUARD` provider in the module OR `app.useGlobalGuards(...)` — **v0.1 does not resolve these** (cross-file). If no method/class guards exist, emit `unknown_middleware_only` with a note that global guards may apply.
4. Concatenate: global (not resolved in v0.1) → class → method → handler

**Koa**:
1. Router-level middleware: `router.METHOD(path, ...middleware, handler)` — same inline pattern as Express
2. App-level: `app.use(middleware)` calls above the router mount
3. Concatenate: app → router → inline → handler

**Raw Node**:
1. Statements in the top-level handler body that execute before the matched route branch (conditional returns, header reads, token parses)
2. Treat each such statement as a "chain entry" for classification

---

## 5. The three-layer classification heuristic

For each chain entry, classify as `auth`, `not-auth`, or `unknown` by applying layers in order. First definitive match wins.

### Layer 1 — Name match

The identifier (function name, decorator argument class name, hook callback name) matches at least one of the following patterns (case-insensitive):

**Positive patterns** (→ `auth`):
- Contains `auth` but **not** `author` (exclude `authorContext`, `authorOnly`, etc.)
- Equals or contains any of: `authenticate`, `authentication`, `authenticated`, `isAuthenticated`, `requireAuth`, `requiresAuth`, `needsAuth`, `ensureAuth`, `withAuth`, `protectRoute`, `protected`, `protect`, `private`, `guarded`, `guard`
- Starts with `require`, `ensure`, `check`, `verify`, `validate` and is immediately followed by any of: `auth`, `user`, `login`, `session`, `token`, `jwt`, `credential`
- NestJS-specific: class name ends with `Guard` (e.g., `AuthGuard`, `JwtAuthGuard`, `RolesGuard` — the detector treats `RolesGuard` as `auth`; authorization is a different detector in future versions)

**Negative patterns** (→ `not-auth` — do not upgrade to `unknown`):
- Matches exactly: `bodyParser`, `cors`, `compression`, `cookieParser`, `morgan`, `helmet`, `rateLimit`, `logger`, `errorHandler`, `notFound`, `staticFiles`, `json`, `urlencoded`, `multer`, `upload`

If no positive or negative pattern matches → fall through to Layer 2.

### Layer 2 — Import origin

Inspect the import source of the identifier. If imported from any package below → classify as `auth`:

```
passport
passport-*
express-jwt
@auth0/*
@clerk/*
@nestjs/passport
@nestjs/jwt
@clerk/clerk-sdk-node
next-auth
@auth/*
lucia
lucia-auth
@supabase/auth-helpers-*
better-auth
firebase-admin/auth
jose                 (JWT library; strong signal but not definitive)
jsonwebtoken         (JWT library; strong signal but not definitive)
```

For `jose` and `jsonwebtoken` specifically — Layer 2 match only if the function body *calls* the library's verification API (`jwt.verify`, `jwtVerify`, `jwtDecrypt`). Mere import is not enough.

If the identifier is imported from a local path (`./`, `../`) — Layer 2 does not apply (we do not resolve cross-file in v0.1; body pattern must carry the decision).

### Layer 3 — Body pattern

If the function body is available in the same file, inspect its statements. Classify as `auth` if **any** of the following appear in the body, before the function returns or calls `next()`:

1. A call matching `jwt.verify(...)`, `jwtVerify(...)`, `jsonwebtoken.verify(...)`, `jose.jwtVerify(...)`
2. A call matching `bcrypt.compare(...)` followed within three statements by a conditional that throws or returns
3. A property read like `req.session.user`, `ctx.state.user`, `request.user` followed within five statements by a conditional that throws or returns or calls `res.status(401|403)` / `throw new UnauthorizedException()` / `throw new HttpException(..., 401)` / `ctx.throw(401)`
4. A call to `res.status(401)`, `res.status(403)`, `res.sendStatus(401)`, `res.sendStatus(403)`
5. `throw` of any of: `UnauthorizedException`, `UnauthorizedError`, `AuthenticationError`, `HttpException` with a 401/403 literal

If the body is not available in the same file and Layers 1–2 did not match → classify as `unknown`.

---

## 6. Verdict logic

After classifying every entry in the chain:

| Chain state                                              | Verdict       | Reason code                  |
|-----------------------------------------------------------|---------------|-------------------------------|
| ≥1 entry is `auth`                                        | `verified`    | (none)                        |
| Chain is empty                                            | `unverified`  | `no_middleware_chain`         |
| All entries are `not-auth`                                | `unverified`  | `no_auth_in_chain`            |
| Mix of `not-auth` and `unknown`, no `auth`                | `partial`     | `unknown_middleware_only`     |
| Framework was not determinable                            | `unverifiable`| `framework_unsupported`       |
| Target not found in file                                  | `unverified`  | `no_route_found`              |
| Parse error                                               | `unverifiable`| `parse_error`                 |
| Invalid claim shape (e.g., wrong `target.kind`)           | `unverifiable`| `invalid_claim_shape`         |

**Evidence**: in every case, the detector emits evidence entries naming the chain members it found and how each was classified. This gives the reviewer a paper trail.

**Evidence ordering rule (critical for CLI rendering)**: the first evidence entry must be a **route summary entry** — `{ kind: "route", path, symbol }` with **no `note` field**. Chain-member entries follow. This ensures the CLI human renderer falls through to the `reason_code` humanization rule (§5.3 rule 2 of `CLI_V01_SPEC.md`) rather than printing a chain-member classification note as the one-line summary.

Example evidence payloads:
```json
[
  { "kind": "route", "path": "src/routes/auth.ts", "symbol": "POST /login" },
  { "kind": "middleware", "symbol": "authMiddleware", "note": "classified auth via Layer 1 name match" },
  { "kind": "middleware", "symbol": "bodyParser.json", "note": "classified not-auth via negative list" },
  { "kind": "middleware", "symbol": "customCheck", "note": "classified unknown — no name/import/body signal" }
]
```

For `verified` verdicts, the route summary entry is still first, followed by the `auth`-classified entry: `{ kind: "middleware", symbol: "authMiddleware", note: "classified auth via Layer 1 name match" }`. The CLI renders `evidence[1].note` as the summary via rule 1 (first entry with a non-empty note wins).

---

## 7. Fixture catalog (v0.1 requirements)

Every fixture lives at `packages/detectors-ts/fixtures/authentication/<name>.ts` with a companion `<name>.expected.json`.

Minimum catalog — **seventeen fixtures**, all must pass before v0.1 ships:

### Express (4 fixtures)
1. `express-route-level-valid.ts` — `app.post("/x", authMiddleware, handler)` → `verified`
2. `express-app-level-valid.ts` — `app.use(authMiddleware)` above `app.post("/x", handler)` → `verified`
3. `express-no-auth.ts` — `app.post("/x", handler)`, no auth anywhere → `unverified` / `no_auth_in_chain`
4. `express-passport-import.ts` — `passport.authenticate("jwt")` as middleware, imported from `passport` → `verified` (Layer 2)

### Fastify (3 fixtures)
5. `fastify-preHandler-valid.ts` — `fastify.post("/x", { preHandler: authHook, handler })` → `verified`
6. `fastify-addHook-valid.ts` — `fastify.addHook("onRequest", authHook)` above route → `verified`
7. `fastify-no-auth.ts` — plain `fastify.post("/x", handler)` → `unverified` / `no_auth_in_chain`

### NestJS (3 fixtures)
8. `nestjs-method-guard-valid.ts` — `@UseGuards(AuthGuard)` on the method → `verified`
9. `nestjs-class-guard-valid.ts` — `@UseGuards(JwtAuthGuard)` on the class → `verified`
10. `nestjs-no-guard.ts` — controller method with no guard → `partial` / `unknown_middleware_only` (because global guards might apply — v0.1 cannot resolve them)

### Koa (3 fixtures)
11. `koa-app-use-valid.ts` — `app.use(authMiddleware)` before the router → `verified`
12. `koa-router-level-valid.ts` — `router.post("/x", requireAuth, handler)` → `verified`
13. `koa-no-auth.ts` — plain router → `unverified` / `no_auth_in_chain`

### Raw Node (2 fixtures)
14. `raw-node-token-check-valid.ts` — handler checks `req.headers.authorization` and responds 401 when absent, before routing → `verified`
15. `raw-node-no-check.ts` — handler routes directly with no auth → `unverified` / `no_auth_in_chain`

### Cross-cutting edge cases (2 fixtures)
16. `ambiguous-custom-middleware.ts` — Express with `app.post("/x", customThing, handler)` where `customThing` is locally defined, has no auth-name, and body is too opaque → `partial` / `unknown_middleware_only`
17. `target-not-found.ts` — claim targets `"POST /missing"` but file has no such route → `unverified` / `no_route_found`

**Expected JSON format per fixture**:
```json
{
  "verdict": "verified",
  "reason_code": null,
  "evidence_contains": ["authMiddleware", "Layer 1"]
}
```

---

## 8. Performance requirements

| Metric                                | Requirement                     |
|---------------------------------------|---------------------------------|
| Single-file detection, <500 LOC       | ≤50 ms on modern laptop         |
| Single-file detection, <5000 LOC      | ≤200 ms                         |
| Network calls                         | **Zero**                         |
| Filesystem reads beyond `target.path` | **Zero** (in v0.1)               |
| Memory                                | <200 MB for full fixture run    |

The detector must not use TypeChecker (`ts-morph`'s `getTypeAtLocation`, etc.) — syntactic AST only. This is explicit: TypeChecker is 100× slower and we do not need type inference to detect the patterns above.

---

## 9. Out of scope (explicit)

- **Cross-file resolution.** If `authMiddleware` is defined in another file, we classify by name (Layer 1) and import (Layer 2). We do not walk to its definition in v0.1.
- **Conditional auth.** Auth applied only to some HTTP methods on the same path, or only under certain runtime conditions. Treated as "whatever the detector sees in the chain."
- **NestJS global guards** (`APP_GUARD`, `useGlobalGuards`). Surfaced as `partial` / `unknown_middleware_only`.
- **Custom framework wrappers.** If the project wraps Express in a house-built abstraction, the detector will emit `framework_unsupported`. This is the correct behavior — the reviewer must manually confirm.
- **Runtime behavior.** We do not execute anything.
- **Authorization.** A separate detector in a future version. `RolesGuard` and similar RBAC constructs are classified as `auth` in v0.1 because they imply an authenticated caller. A dedicated `authorization` detector will refine this later.

---

## 10. Reason code enumeration (final)

All reason codes the detector may emit:

```
parse_error
framework_unsupported
invalid_claim_shape
no_route_found
no_middleware_chain
no_auth_in_chain
unknown_middleware_only
```

No other reason codes are permitted. If the detector encounters a condition not covered by these codes, it must return `unverifiable` with `reason_code: "parse_error"` and include a descriptive `note` in evidence. Add a new reason code only via spec revision.

These codes apply exclusively to the authentication detector. Core-level reason codes (e.g., `detector_not_implemented`, `unsupported_check`) are defined in `PROJECT_SPEC.md §8.2` and may appear in `ClaimResult.reason_code` when the routing layer — not this detector — produces the verdict.

---

## 11. Acceptance test definition

The authentication detector is acceptance-complete when:

1. All seventeen fixtures in §7 pass (verdict + reason_code + evidence_contains)
2. Zero fixtures take longer than the budgets in §8
3. The detector exports only `detectAuthentication` from `src/authentication/index.ts`; framework modules are internal
4. The detector adds zero dependencies beyond those in `PROJECT_SPEC.md` §5
5. `pnpm --filter @attest/detectors-ts test` exits 0
6. Code coverage on `src/authentication/` is ≥85% line coverage

---

## 12. Known limitations to document in README

When shipping v0.1, the README must list these honestly so users don't hit surprises:

- Cross-file middleware definitions are classified by name/import only
- NestJS global guards are flagged as `partial`, not `verified`
- Custom framework abstractions will fall through to `framework_unsupported`
- Syntactic analysis only — no type inference, no runtime execution

Honest limitations build trust. Hiding them burns it.
