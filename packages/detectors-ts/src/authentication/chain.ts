import { SyntaxKind, type SourceFile, type CallExpression, type Node } from "ts-morph";
import type { KnownFramework, ChainEntry } from "./types.js";
import { classifyEntry } from "./classify.js";

// ─── Express / Koa helpers ─────────────────────────────────────────────────

/** Find `app.METHOD(path, ...)` — strict match on method + path */
function findRouteCall(
  sourceFile: SourceFile,
  method: string,
  path: string,
): CallExpression | null {
  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = callExpr.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
    const prop = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const methodName = prop.getName().toLowerCase();
    if (methodName !== method.toLowerCase()) continue;

    const args = callExpr.getArguments();
    const firstArg = args[0];
    if (!firstArg || firstArg.getKind() !== SyntaxKind.StringLiteral) continue;
    const val = firstArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
    if (val !== path) continue;

    return callExpr;
  }
  return null;
}

/** Collect inline middleware from `app.METHOD(path, m1, m2, handler)` args[1..n-1] */
function inlineMiddleware(callExpr: CallExpression): string[] {
  const args = callExpr.getArguments();
  // args[0] = path, args[1..n-2] = middleware, args[n-1] = handler
  if (args.length <= 2) return [];
  return args.slice(1, args.length - 1).map((a) => a.getText());
}

/** Get line number of a node */
function lineOf(node: Node): number {
  return node.getStartLineNumber();
}

/** Collect app.use(middleware) calls ABOVE the given line in source */
function collectAppUseBefore(
  sourceFile: SourceFile,
  beforeLine: number,
  routePath: string,
): string[] {
  const result: string[] = [];
  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (lineOf(callExpr) >= beforeLine) continue;
    const expr = callExpr.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
    const prop = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    if (prop.getName() !== "use") continue;

    const args = callExpr.getArguments();
    if (args.length === 0) continue;

    const firstArg = args[0];
    if (!firstArg) continue;

    // If first arg is a string (path prefix), only include if route starts with it
    if (firstArg.getKind() === SyntaxKind.StringLiteral) {
      const prefix = firstArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
      if (!routePath.startsWith(prefix)) continue;
      // Remaining args are middleware
      for (const arg of args.slice(1)) result.push(arg.getText());
    } else {
      // All args are middleware
      for (const arg of args) result.push(arg.getText());
    }
  }
  return result;
}

// ─── Fastify helpers ───────────────────────────────────────────────────────

function findFastifyRoute(
  sourceFile: SourceFile,
  method: string,
  path: string,
): CallExpression | null {
  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = callExpr.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
    const prop = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const methodName = prop.getName().toLowerCase();

    // fastify.METHOD("/path", options)
    if (methodName === method.toLowerCase()) {
      const args = callExpr.getArguments();
      const firstArg = args[0];
      if (firstArg?.getKind() === SyntaxKind.StringLiteral) {
        const val = firstArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
        if (val === path) return callExpr;
      }
    }

    // fastify.route({ method, url, ... })
    if (methodName === "route") {
      const args = callExpr.getArguments();
      const firstArg = args[0];
      if (firstArg?.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const obj = firstArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        let methodMatch = false,
          urlMatch = false;
        for (const p of obj.getProperties()) {
          if (p.getKind() !== SyntaxKind.PropertyAssignment) continue;
          const pa = p.asKindOrThrow(SyntaxKind.PropertyAssignment);
          const pname = pa.getName();
          const init = pa.getInitializer();
          if (!init) continue;
          if (pname === "method" && init.getKind() === SyntaxKind.StringLiteral) {
            const v = init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
            if (v.toUpperCase() === method.toUpperCase()) methodMatch = true;
          }
          if (
            (pname === "url" || pname === "path") &&
            init.getKind() === SyntaxKind.StringLiteral
          ) {
            const v = init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
            if (v === path) urlMatch = true;
          }
        }
        if (methodMatch && urlMatch) return callExpr;
      }
    }
  }
  return null;
}

/** Collect preHandler/onRequest/preValidation from fastify route options object */
function fastifyRouteHooks(callExpr: CallExpression): string[] {
  const args = callExpr.getArguments();
  const hookNames = new Set(["prehandler", "onrequest", "prevalidation"]);
  const result: string[] = [];

  // For fastify.METHOD(path, optionsObj) — check args[1]
  // For fastify.route(configObj) — check args[0]
  for (const arg of args) {
    if (arg.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
    const obj = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    for (const p of obj.getProperties()) {
      if (p.getKind() !== SyntaxKind.PropertyAssignment) continue;
      const pa = p.asKindOrThrow(SyntaxKind.PropertyAssignment);
      const pname = pa.getName().toLowerCase();
      if (!hookNames.has(pname)) continue;
      const init = pa.getInitializer();
      if (init) result.push(init.getText());
    }
  }
  return result;
}

/** Collect global fastify.addHook("onRequest"|..., fn) before route line */
function fastifyGlobalHooks(sourceFile: SourceFile, beforeLine: number): string[] {
  const hookNames = new Set(["onrequest", "prevalidation", "prehandler"]);
  const result: string[] = [];
  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (lineOf(callExpr) >= beforeLine) continue;
    const expr = callExpr.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
    const prop = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    if (prop.getName() !== "addHook") continue;

    const args = callExpr.getArguments();
    const firstArg = args[0];
    const secondArg = args[1];
    if (!firstArg || firstArg.getKind() !== SyntaxKind.StringLiteral) continue;
    const hookName = firstArg
      .asKindOrThrow(SyntaxKind.StringLiteral)
      .getLiteralValue()
      .toLowerCase();
    if (!hookNames.has(hookName)) continue;
    if (secondArg) result.push(secondArg.getText());
  }
  return result;
}

// ─── NestJS helpers ────────────────────────────────────────────────────────

function nestjsChain(
  sourceFile: SourceFile,
  className: string,
  methodName: string,
): ChainEntry[] | null {
  const cls = sourceFile.getClass(className);
  if (!cls) return null;

  // Verify @Controller decorator
  const hasController = cls.getDecorators().some((d) => d.getName() === "Controller");
  if (!hasController) return null;

  // Find method
  const method = cls.getMethod(methodName);
  if (!method) return null;

  // Verify HTTP decorator on method
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
  const hasHttpDecorator = method.getDecorators().some((d) => HTTP_DECORATORS.has(d.getName()));
  if (!hasHttpDecorator) return null;

  const entries: ChainEntry[] = [];

  // Class-level @UseGuards
  for (const dec of cls.getDecorators()) {
    if (dec.getName() !== "UseGuards") continue;
    for (const arg of dec.getArguments()) {
      const guardName = arg.getText();
      const { classification, layer } = classifyEntry(guardName, sourceFile);
      entries.push({ name: guardName, classification, layer });
    }
  }

  // Method-level @UseGuards
  for (const dec of method.getDecorators()) {
    if (dec.getName() !== "UseGuards") continue;
    for (const arg of dec.getArguments()) {
      const guardName = arg.getText();
      const { classification, layer } = classifyEntry(guardName, sourceFile);
      entries.push({ name: guardName, classification, layer });
    }
  }

  return entries;
}

// ─── Raw Node helpers ──────────────────────────────────────────────────────

function rawNodeChain(sourceFile: SourceFile, method: string, path: string): ChainEntry[] | null {
  // Find http.createServer((req, res) => { ... })
  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = callExpr.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
    const prop = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    if (prop.getName() !== "createServer") continue;

    const args = callExpr.getArguments();
    const handler = args[0];
    if (!handler) continue;

    const bodyText = handler.getText();

    // Find the if-branch matching method+path
    const routePattern = new RegExp(
      `req\\.method\\s*===?\\s*["']${method}["']|req\\.url\\s*===?\\s*["']${path.replace("/", "\\/")}["']`,
    );

    const lines = bodyText.split("\n");
    const routeLineIdx = lines.findIndex((l) => routePattern.test(l));

    if (routeLineIdx === -1) return null; // route not found

    // Collect pre-route statements — skip the function signature line (line 0)
    const preRouteText = lines.slice(1, routeLineIdx).join("\n");

    const entries: ChainEntry[] = [];

    const hasAuthHeader =
      /req\.headers\.authorization/.test(preRouteText) &&
      /(return|writeHead\s*\(\s*(401|403))/.test(preRouteText);

    const hasStatus401 =
      /writeHead\s*\(\s*(401|403)/.test(preRouteText) ||
      /res\.(status|sendStatus)\s*\(\s*(401|403)\s*\)/.test(preRouteText);

    if (hasAuthHeader || hasStatus401) {
      entries.push({
        name: "pre-route auth check",
        classification: "auth",
        layer: "Layer 3 body pattern",
      });
    } else if (preRouteText.trim()) {
      entries.push({ name: "pre-route statements", classification: "unknown", layer: "no signal" });
    }

    return entries;
  }
  return null;
}

// ─── Main chain collection ─────────────────────────────────────────────────

export type { ChainEntry } from "./types.js";

export function collectChain(
  sourceFile: SourceFile,
  framework: KnownFramework,
  symbol: string,
): ChainEntry[] | "not_found" {
  if (framework === "nestjs") {
    const [className, methodName] = symbol.split(".");
    if (!className || !methodName) return "not_found";
    const entries = nestjsChain(sourceFile, className, methodName);
    if (entries === null) return "not_found";
    // NestJS: if no guards found, emit unknown (global guards may apply)
    if (entries.length === 0) {
      return [
        {
          name: "global guards unresolved",
          classification: "unknown",
          layer: "NestJS global guards not resolved in v0.1",
        },
      ];
    }
    return entries;
  }

  if (framework === "rawnode") {
    const parts = symbol.match(/^([A-Z]+)\s+(.+)$/);
    if (!parts) return "not_found";
    const [, method, path] = parts as [string, string, string];
    const entries = rawNodeChain(sourceFile, method, path);
    if (entries === null) return "not_found";
    return entries;
  }

  // Express / Koa / Fastify — symbol is "METHOD /path"
  const parts = symbol.match(/^([A-Z]+)\s+(.+)$/);
  if (!parts) return "not_found";
  const [, method, path] = parts as [string, string, string];

  if (framework === "fastify") {
    const routeCall = findFastifyRoute(sourceFile, method, path);
    if (!routeCall) return "not_found";
    const routeLine = lineOf(routeCall);

    const globalHooks = fastifyGlobalHooks(sourceFile, routeLine);
    const routeHooks = fastifyRouteHooks(routeCall);
    const allNames = [...globalHooks, ...routeHooks];

    return allNames.map((name) => {
      const { classification, layer } = classifyEntry(name, sourceFile);
      return { name, classification, layer };
    });
  }

  // Express or Koa
  const routeCall = findRouteCall(sourceFile, method, path);
  if (!routeCall) return "not_found";

  const routeLine = lineOf(routeCall);
  const appLevelNames = collectAppUseBefore(sourceFile, routeLine, path);
  const inlineNames = inlineMiddleware(routeCall);
  const allNames = [...appLevelNames, ...inlineNames];

  return allNames.map((name) => {
    const { classification, layer } = classifyEntry(name, sourceFile);
    return { name, classification, layer };
  });
}
