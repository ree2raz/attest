import { type SourceFile } from "ts-morph";
import type { Classification } from "./types.js";

// Layer 1 — Name match

const NEGATIVE_NAMES = new Set([
  "bodyparser",
  "cors",
  "compression",
  "cookieparser",
  "morgan",
  "helmet",
  "ratelimit",
  "logger",
  "errorhandler",
  "notfound",
  "staticfiles",
  "json",
  "urlencoded",
  "multer",
  "upload",
]);

const POSITIVE_EXACT = new Set([
  "authenticate",
  "authentication",
  "authenticated",
  "isauthenticated",
  "requireauth",
  "requiresauth",
  "needsauth",
  "ensureauth",
  "withauth",
  "protectroute",
  "protected",
  "protect",
  "private",
  "guarded",
  "guard",
]);

const AUTH_REQUIRE_PREFIXES = ["require", "ensure", "check", "verify", "validate"];
const AUTH_REQUIRE_SUFFIXES = ["auth", "user", "login", "session", "token", "jwt", "credential"];

// Layer 2 — Auth packages
const AUTH_PACKAGES = new Set([
  "passport",
  "express-jwt",
  "lucia",
  "lucia-auth",
  "next-auth",
  "@nestjs/passport",
  "@nestjs/jwt",
  "@clerk/clerk-sdk-node",
  "better-auth",
  "firebase-admin/auth",
]);

const AUTH_PACKAGE_PREFIXES = [
  "passport-",
  "@auth0/",
  "@clerk/",
  "@auth/",
  "@supabase/auth-helpers-",
];

// jose/jsonwebtoken need body verification check
const JWT_VERIFY_PACKAGES = new Set(["jose", "jsonwebtoken"]);

function layer1Name(name: string): Classification | null {
  const lower = name.toLowerCase();

  if (NEGATIVE_NAMES.has(lower)) return "not-auth";

  // "auth" but not "author"
  if (lower.includes("auth") && !lower.includes("author")) return "auth";

  if (POSITIVE_EXACT.has(lower)) return "auth";

  // NestJS Guard suffix
  if (lower.endsWith("guard")) return "auth";

  // Prefix+suffix combos
  for (const prefix of AUTH_REQUIRE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      const rest = lower.slice(prefix.length);
      for (const suffix of AUTH_REQUIRE_SUFFIXES) {
        if (rest === suffix || rest.startsWith(suffix)) return "auth";
      }
    }
  }

  return null;
}

function isAuthPackage(pkg: string): boolean {
  if (AUTH_PACKAGES.has(pkg)) return true;
  for (const prefix of AUTH_PACKAGE_PREFIXES) {
    if (pkg.startsWith(prefix)) return true;
  }
  return false;
}

function layer2Import(name: string, sourceFile: SourceFile): Classification | null {
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpec = importDecl.getModuleSpecifierValue();

    // Skip local imports
    if (moduleSpec.startsWith("./") || moduleSpec.startsWith("../")) continue;

    let imported = false;

    // Check default import
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport?.getText() === name) imported = true;

    // Check named imports
    if (!imported) {
      for (const namedImport of importDecl.getNamedImports()) {
        if (namedImport.getName() === name || namedImport.getAliasNode()?.getText() === name) {
          imported = true;
          break;
        }
      }
    }

    // Check namespace import
    if (!imported) {
      const ns = importDecl.getNamespaceImport();
      if (ns?.getText() === name) imported = true;
    }

    if (!imported) continue;

    // JWT libs need body verification
    if (JWT_VERIFY_PACKAGES.has(moduleSpec)) {
      // Only auth if body actually calls verify
      return null; // Defer to body check — handled at call site
    }

    if (isAuthPackage(moduleSpec)) return "auth";
  }
  return null;
}

/**
 * Layer 3 — Body pattern: looks for auth signals in function body.
 * Returns "auth" if patterns found, null otherwise.
 */
function layer3Body(name: string, sourceFile: SourceFile): Classification | null {
  // Find the function declaration with this name
  const fn = sourceFile.getFunction(name);
  const varDecl = fn
    ? null
    : sourceFile.getVariableDeclarations().find((v) => v.getName() === name);

  const bodyNode = fn ?? varDecl?.getInitializer();
  if (!bodyNode) return null;

  const text = bodyNode.getText();

  // jwt.verify pattern
  if (
    /jwt\.verify\s*\(/.test(text) ||
    /jwtVerify\s*\(/.test(text) ||
    /jwtDecrypt\s*\(/.test(text) ||
    /jsonwebtoken\.verify\s*\(/.test(text) ||
    /jose\.jwtVerify\s*\(/.test(text)
  ) {
    return "auth";
  }

  // res.status(401/403) or res.sendStatus(401/403)
  if (/res\.(status|sendStatus)\s*\(\s*(401|403)\s*\)/.test(text)) return "auth";

  // ctx.throw(401)
  if (/ctx\.throw\s*\(\s*(401|403)/.test(text)) return "auth";

  // writeHead(401)
  if (/writeHead\s*\(\s*(401|403)/.test(text)) return "auth";

  // reply.status(401)
  if (/reply\.(status|code)\s*\(\s*(401|403)\s*\)/.test(text)) return "auth";

  // throw UnauthorizedException / UnauthorizedError / AuthenticationError
  if (/throw\s+new\s+(UnauthorizedException|UnauthorizedError|AuthenticationError)/.test(text))
    return "auth";

  // throw new HttpException(..., 401/403)
  if (/throw\s+new\s+HttpException\s*\([\s\S]*?(401|403)/.test(text)) return "auth";

  // req.session.user / ctx.state.user / request.user checks
  if (
    /(req\.session\.user|ctx\.state\.user|request\.user)/.test(text) &&
    /(throw|return|status\s*\(\s*(401|403)\s*\)|ctx\.throw)/.test(text)
  ) {
    return "auth";
  }

  // req.headers.authorization read followed by early return/throw
  if (/req\.headers\.authorization/.test(text) && /return|throw/.test(text)) return "auth";

  return null;
}

/**
 * Resolve the import package for a name — used for passport.authenticate() member access.
 */
function resolveImportPackage(name: string, sourceFile: SourceFile): string | null {
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpec = importDecl.getModuleSpecifierValue();
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport?.getText() === name) return moduleSpec;
    const ns = importDecl.getNamespaceImport();
    if (ns?.getText() === name) return moduleSpec;
    for (const ni of importDecl.getNamedImports()) {
      if (ni.getName() === name) return moduleSpec;
    }
  }
  return null;
}

/**
 * Classify a single middleware/guard entry by name.
 * name may be "foo" or "foo.bar" (member expression like passport.authenticate).
 */
export function classifyEntry(
  name: string,
  sourceFile: SourceFile,
): { classification: Classification; layer: string } {
  // For member expressions like "passport.authenticate", use root object name for import check
  const rootName = name.split(".")[0] ?? name;

  // Extract leaf method name for "obj.method()" patterns (e.g., "express.json()" → "json")
  const leafMatch = name.match(/\.(\w+)\s*[\.(]/);
  const leafName = leafMatch ? leafMatch[1] : null;

  // Layer 1
  const l1 = layer1Name(name) ?? layer1Name(rootName) ?? (leafName ? layer1Name(leafName) : null);
  if (l1 === "not-auth") return { classification: "not-auth", layer: "Layer 1 negative list" };
  if (l1 === "auth") return { classification: "auth", layer: "Layer 1 name match" };

  // Layer 2 — direct identifier import
  const l2Direct = layer2Import(rootName, sourceFile);
  if (l2Direct === "auth") return { classification: "auth", layer: "Layer 2 import origin" };

  // For passport specifically: passport.authenticate is Layer 2
  if (rootName !== name) {
    const pkg = resolveImportPackage(rootName, sourceFile);
    if (pkg && isAuthPackage(pkg))
      return { classification: "auth", layer: "Layer 2 import origin" };
  }

  // JWT libs: check body
  const jwtPkg = resolveImportPackage(rootName, sourceFile);
  if (jwtPkg && JWT_VERIFY_PACKAGES.has(jwtPkg)) {
    // Check if the call expression has jwt.verify etc.
    // We can't easily check the call site here, handled in body layer
  }

  // Layer 3 — body pattern
  const l3 = layer3Body(rootName, sourceFile);
  if (l3 === "auth") return { classification: "auth", layer: "Layer 3 body pattern" };

  return { classification: "unknown", layer: "no signal" };
}
