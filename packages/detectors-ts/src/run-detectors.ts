import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Project, SyntaxKind, type CallExpression, type SourceFile } from "ts-morph";
import { detectAuthentication } from "./authentication/index.js";
import type { DetectorInput, DetectorOutput } from "./types.js";

/** HTTP method verbs we treat as route declarations (case-insensitive on call). */
const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch", "options", "head", "all"]);

/**
 * Recognised file extensions — the detectors only know how to read TS/JS source.
 * `.mts`/`.cts`/`.mjs`/`.cjs` map to the TS grammar at the AST level.
 */
const SOURCE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;

/**
 * Top-level entry point. Scans every non-deleted source file in `diff` and
 * returns one {@link DetectorOutput} per discovered route. **Advisory only —
 * never a verdict** (SPEC §6.5). The output array carries `warnings` on
 * every entry; callers that want to log them get them for free.
 *
 * File reads default to `readFile(join(repoRoot, path))`. Tests and callers
 * running inside a worktree can pass `input.readFile` to inject the
 * post-change content directly.
 */
export async function runDetectors(input: DetectorInput): Promise<DetectorOutput[]> {
  const { diff, repoRoot } = input;
  const read = input.readFile ?? defaultReadFile(repoRoot);

  const outputs: DetectorOutput[] = [];
  for (const file of diff.files) {
    if (file.op === "delete") continue;
    if (!SOURCE_EXTENSIONS.test(file.path)) continue;

    const content = await read(file.path);
    if (content === null) continue;

    const symbols = findRoutesInFile(file.path, content);
    for (const symbol of symbols) {
      outputs.push(await detectAuthentication({ path: file.path, symbol, content }));
    }
  }
  return outputs;
}

function defaultReadFile(repoRoot: string): (path: string) => Promise<string | null> {
  return async (path) => {
    try {
      return await readFile(join(repoRoot, path), "utf-8");
    } catch {
      return null;
    }
  };
}

/**
 * Enumerate the route symbols present in a file. Returns an array of strings
 * shaped exactly the way `chain.ts` expects them:
 *
 *   - Express/Fastify/Koa/raw-Node  → `"POST /x"`  (METHOD + space + path)
 *   - NestJS                        → `"ClassName.methodName"`
 *
 * Order is preserved (source order) and duplicates are removed.
 */
export function findRoutesInFile(path: string, content: string): string[] {
  const symbols = new Set<string>();

  // ts-morph for structural cases (Express/Fastify/Koa method calls, NestJS
  // controllers, Fastify route() config objects).
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
    });
    const sourceFile = project.createSourceFile(path, content);
    collectFromCallExpressions(sourceFile, symbols);
    collectFromNestControllers(sourceFile, symbols);
  } catch {
    // Fall through — raw-Node regex below can still find routes in body text.
  }

  // Raw Node: routes are `req.method === "X" && req.url === "/y"` patterns in
  // the body of an `http(s).createServer(...)` callback. The chain logic
  // expects them in the same `"METHOD /path"` shape.
  collectFromRawNodeBody(content, symbols);

  return [...symbols];
}

function collectFromCallExpressions(sourceFile: SourceFile, out: Set<string>): void {
  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = callExpr.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
    const prop = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const propName = prop.getName().toLowerCase();
    if (!HTTP_METHODS.has(propName)) continue;

    const args = callExpr.getArguments();
    const first = args[0];
    if (!first || first.getKind() !== SyntaxKind.StringLiteral) continue;
    const route = first.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
    out.add(`${propName.toUpperCase()} ${route}`);

    // Also check second arg for fastify.METHOD(path, { preHandler, ... }) — the
    // route symbol is the same, but the second arg may carry a route() object
    // literal with hooks. We still emit the symbol here; chain.ts handles the
    // hooks via fastifyRouteHooks. (intentional no-op for hook discovery at this
    // pass — the chain re-walks.)
    void args;
  }

  // fastify.route({ method, url, ... })
  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = callExpr.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
    const prop = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    if (prop.getName() !== "route") continue;
    const routeObj = extractFastifyRouteObject(callExpr);
    if (routeObj) out.add(`${routeObj.method} ${routeObj.url}`);
  }
}

function extractFastifyRouteObject(
  callExpr: CallExpression,
): { method: string; url: string } | null {
  const first = callExpr.getArguments()[0];
  if (!first || first.getKind() !== SyntaxKind.ObjectLiteralExpression) return null;
  const obj = first.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  let method: string | null = null;
  let url: string | null = null;
  for (const p of obj.getProperties()) {
    if (p.getKind() !== SyntaxKind.PropertyAssignment) continue;
    const pa = p.asKindOrThrow(SyntaxKind.PropertyAssignment);
    const name = pa.getName();
    const init = pa.getInitializer();
    if (!init || init.getKind() !== SyntaxKind.StringLiteral) continue;
    const val = init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
    if (name === "method") method = val.toUpperCase();
    else if (name === "url" || name === "path") url = val;
  }
  return method && url ? { method, url } : null;
}

function collectFromNestControllers(sourceFile: SourceFile, out: Set<string>): void {
  const HTTP_DECORATORS = new Set([
    "Get",
    "Post",
    "Put",
    "Delete",
    "Patch",
    "Options",
    "Head",
    "All",
  ]);
  for (const cls of sourceFile.getClasses()) {
    const hasController = cls.getDecorators().some((d) => d.getName() === "Controller");
    if (!hasController) continue;
    const className = cls.getName();
    if (!className) continue;
    for (const method of cls.getMethods()) {
      const hasHttp = method.getDecorators().some((d) => HTTP_DECORATORS.has(d.getName()));
      if (!hasHttp) continue;
      out.add(`${className}.${method.getName()}`);
    }
  }
}

/**
 * Find `req.method === "X" && req.url === "/y"` patterns. We accept the two
 * halves in either order and tolerate extra whitespace / `==` vs `===`. This
 * is the raw-Node form the v0.1 detector already supports via `chain.ts`.
 */
function collectFromRawNodeBody(content: string, out: Set<string>): void {
  const methodRe = /req\.method\s*===?\s*["']([A-Z]+)["']/g;
  const urlRe = /req\.url\s*===?\s*["']([^"']+)["']/g;
  const methodMatches = [...content.matchAll(methodRe)];
  const urlMatches = [...content.matchAll(urlRe)];
  if (methodMatches.length === 0 || urlMatches.length === 0) return;

  // Pair by source proximity: assume a route is the nearest method+url pair on
  // a single line (the typical hand-written raw-Node form).
  const lineMethod = new Map<number, string>();
  for (const m of methodMatches) {
    if (m.index === undefined) continue;
    const line = lineOfIndex(content, m.index);
    lineMethod.set(line, m[1]!);
  }
  const lineUrl = new Map<number, string>();
  for (const m of urlMatches) {
    if (m.index === undefined) continue;
    const line = lineOfIndex(content, m.index);
    lineUrl.set(line, m[1]!);
  }
  for (const [line, method] of lineMethod) {
    const url = lineUrl.get(line);
    if (url) out.add(`${method} ${url}`);
  }
}

function lineOfIndex(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}
