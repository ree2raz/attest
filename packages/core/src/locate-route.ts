/**
 * locateRoute() + detectFramework() — shared route-location utility.
 *
 * Used by:
 *   - @attest/core checks/symbol-exists.ts  (symbol_exists on endpoint targets)
 *   - @attest/detectors-ts authentication/* (middleware chain collection)
 *
 * Syntactic AST only — no TypeChecker, no type inference.
 */
import { SyntaxKind, type SourceFile, type Node } from "ts-morph";

export type KnownFramework = "express" | "fastify" | "nestjs" | "koa" | "raw-node";

const EXPRESS_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",
  "all",
  "use",
]);

const NESTJS_HTTP_DECORATORS = new Set([
  "Get",
  "Post",
  "Put",
  "Delete",
  "Patch",
  "Options",
  "Head",
  "All",
]);

export interface RouteLocation {
  framework: KnownFramework;
  /** The primary AST node anchoring the route (CallExpression or MethodDeclaration). */
  registrationNode: Node;
}

/**
 * Scans import declarations (first-match wins) to identify the HTTP framework in use.
 * Returns null if no recognized framework import is found.
 */
export function detectFramework(sourceFile: SourceFile): KnownFramework | null {
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const mod = importDecl.getModuleSpecifierValue();
    if (mod === "express") return "express";
    if (mod === "fastify") return "fastify";
    if (mod === "@nestjs/common" || mod === "@nestjs/core") return "nestjs";
    if (mod === "koa" || mod === "@koa/router") return "koa";
    if (mod === "http" || mod === "https" || mod === "node:http" || mod === "node:https") {
      return "raw-node";
    }
  }
  return null;
}

/**
 * Parses a "METHOD /path" symbol string into its components.
 * Returns null if the format is invalid.
 */
function parseExpressSymbol(symbol: string): { method: string; path: string } | null {
  const spaceIdx = symbol.indexOf(" ");
  if (spaceIdx === -1) return null;
  const method = symbol.slice(0, spaceIdx).toLowerCase();
  const path = symbol.slice(spaceIdx + 1);
  return { method, path };
}

/** Parses a "ClassName.methodName" NestJS symbol. */
function parseNestJsSymbol(symbol: string): { className: string; methodName: string } | null {
  const dotIdx = symbol.lastIndexOf(".");
  if (dotIdx === -1) return null;
  return { className: symbol.slice(0, dotIdx), methodName: symbol.slice(dotIdx + 1) };
}

// ─── Framework-specific locators ────────────────────────────────────────────

function locateExpressStyleRoute(
  sourceFile: SourceFile,
  symbol: string,
  framework: KnownFramework,
): RouteLocation | null {
  const parsed = parseExpressSymbol(symbol);
  if (!parsed) return null;
  const { method, path } = parsed;

  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = callExpr.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

    const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const methodName = propAccess.getName().toLowerCase();
    if (!EXPRESS_METHODS.has(methodName) || methodName !== method) continue;

    const args = callExpr.getArguments();
    if (args.length === 0) continue;
    const firstArg = args[0];
    if (!firstArg || firstArg.getKind() !== SyntaxKind.StringLiteral) continue;

    const pathLiteral = firstArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
    if (pathLiteral === path) {
      return { framework, registrationNode: callExpr };
    }
  }
  return null;
}

function locateFastifyRoute(sourceFile: SourceFile, symbol: string): RouteLocation | null {
  const parsed = parseExpressSymbol(symbol);
  if (!parsed) return null;
  const { method, path } = parsed;

  for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = callExpr.getExpression();

    if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
      const methodName = propAccess.getName().toLowerCase();

      // fastify.METHOD("/path", ...) style
      if (EXPRESS_METHODS.has(methodName) && methodName === method) {
        const args = callExpr.getArguments();
        const firstArg = args[0];
        if (firstArg?.getKind() === SyntaxKind.StringLiteral) {
          const pathLiteral = firstArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
          if (pathLiteral === path) {
            return { framework: "fastify", registrationNode: callExpr };
          }
        }
      }

      // fastify.route({method, url, ...}) style
      if (propAccess.getName() === "route") {
        const args = callExpr.getArguments();
        const firstArg = args[0];
        if (firstArg?.getKind() === SyntaxKind.ObjectLiteralExpression) {
          const obj = firstArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
          const methodProp = obj
            .getProperties()
            .find(
              (p) =>
                p.getKind() === SyntaxKind.PropertyAssignment &&
                p.asKindOrThrow(SyntaxKind.PropertyAssignment).getName() === "method",
            );
          const urlProp = obj
            .getProperties()
            .find(
              (p) =>
                p.getKind() === SyntaxKind.PropertyAssignment &&
                p.asKindOrThrow(SyntaxKind.PropertyAssignment).getName() === "url",
            );
          if (methodProp && urlProp) {
            const methodVal = methodProp
              .asKindOrThrow(SyntaxKind.PropertyAssignment)
              .getInitializer()
              ?.getText()
              .replace(/['"]/g, "")
              .toLowerCase();
            const urlVal = urlProp
              .asKindOrThrow(SyntaxKind.PropertyAssignment)
              .getInitializer()
              ?.getText()
              .replace(/['"]/g, "");
            if (methodVal === method && urlVal === path) {
              return { framework: "fastify", registrationNode: callExpr };
            }
          }
        }
      }
    }
  }
  return null;
}

function locateNestJsRoute(sourceFile: SourceFile, symbol: string): RouteLocation | null {
  const parsed = parseNestJsSymbol(symbol);
  if (!parsed) return null;
  const { className, methodName } = parsed;

  for (const classDecl of sourceFile.getClasses()) {
    if (classDecl.getName() !== className) continue;
    if (!classDecl.getDecorator("Controller")) continue;

    for (const method of classDecl.getMethods()) {
      if (method.getName() !== methodName) continue;
      for (const dec of NESTJS_HTTP_DECORATORS) {
        if (method.getDecorator(dec)) {
          return { framework: "nestjs", registrationNode: method };
        }
      }
    }
  }
  return null;
}

function locateRawNodeRoute(sourceFile: SourceFile, symbol: string): RouteLocation | null {
  const parsed = parseExpressSymbol(symbol);
  if (!parsed) return null;
  const { method, path } = parsed;

  // Look for if-branches matching req.method === "METHOD" && req.url === "/path"
  for (const ifStmt of sourceFile.getDescendantsOfKind(SyntaxKind.IfStatement)) {
    const condition = ifStmt.getExpression().getText();
    const methodUpper = method.toUpperCase();
    if (
      condition.includes(`"${methodUpper}"`) &&
      condition.includes(`"${path}"`) &&
      condition.includes("req.method") &&
      condition.includes("req.url")
    ) {
      return { framework: "raw-node", registrationNode: ifStmt };
    }
  }
  return null;
}

/**
 * Locates the route registration node in a source file for the given symbol.
 *
 * @param sourceFile  Already-parsed ts-morph SourceFile (syntactic, no TypeChecker needed)
 * @param symbol      "METHOD /path" for Express/Fastify/Koa/Raw-Node;
 *                    "ClassName.methodName" for NestJS
 * @returns RouteLocation if found, null if not found or framework unrecognized
 */
export function locateRoute(sourceFile: SourceFile, symbol: string): RouteLocation | null {
  const framework = detectFramework(sourceFile);
  if (!framework) return null;

  switch (framework) {
    case "express":
      return locateExpressStyleRoute(sourceFile, symbol, "express");
    case "koa":
      return locateExpressStyleRoute(sourceFile, symbol, "koa");
    case "fastify":
      return locateFastifyRoute(sourceFile, symbol);
    case "nestjs":
      return locateNestJsRoute(sourceFile, symbol);
    case "raw-node":
      return locateRawNodeRoute(sourceFile, symbol);
  }
}
