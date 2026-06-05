import type Parser from "web-tree-sitter";
import type { Lang, SymbolDecl, SymbolKind } from "./types.js";

type Node = Parser.SyntaxNode;

/**
 * Extract top-level (and class-member) declarations from a parse tree. Recursion
 * is deliberately shallow: top-level declarations plus one level into class bodies
 * for methods. We do NOT descend into function bodies — a local helper inside a
 * function is not a declared API surface, and collecting it would make undeclared-
 * change detection (SPEC §6.3) noisy. Structure only; never behavior.
 */
export function extractFromTree(lang: Lang, root: Node): SymbolDecl[] {
  switch (lang) {
    case "ts":
    case "tsx":
      return extractTsLike(root);
    case "py":
      return extractPython(root);
    case "go":
      return extractGo(root);
  }
}

function decl(node: Node, name: string, kinds: SymbolKind[]): SymbolDecl {
  const first = kinds[0];
  if (first === undefined) throw new Error("decl requires at least one kind");
  return {
    name,
    kind: first,
    kinds,
    nodeKind: node.type,
    line: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    text: node.text,
  };
}

function nameOf(node: Node): string | null {
  return node.childForFieldName("name")?.text ?? null;
}

// ---------------------------------------------------------------------------
// TypeScript / TSX
// ---------------------------------------------------------------------------

const TS_FUNCTION_VALUES = new Set([
  "arrow_function",
  "function",
  "function_expression",
  "generator_function",
]);

function extractTsLike(root: Node): SymbolDecl[] {
  const out: SymbolDecl[] = [];
  for (const top of root.namedChildren) {
    // `export <decl>` wraps the real declaration; unwrap to it.
    const node = top.type === "export_statement" ? exportedDeclaration(top) : top;
    if (node) collectTsDecl(node, out);
  }
  return out;
}

function exportedDeclaration(exportStmt: Node): Node | null {
  const declared = exportStmt.childForFieldName("declaration");
  if (declared) return declared;
  // `export default <decl>` and similar: first declaration-like named child.
  for (const child of exportStmt.namedChildren) {
    if (TS_DECL_TYPES.has(child.type)) return child;
  }
  return null;
}

const TS_DECL_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "class_declaration",
  "abstract_class_declaration",
  "interface_declaration",
  "type_alias_declaration",
  "enum_declaration",
  "lexical_declaration",
  "variable_declaration",
]);

function collectTsDecl(node: Node, out: SymbolDecl[]): void {
  switch (node.type) {
    case "function_declaration":
    case "generator_function_declaration": {
      const name = nameOf(node);
      if (name) out.push(decl(node, name, ["function"]));
      return;
    }
    case "class_declaration":
    case "abstract_class_declaration": {
      const name = nameOf(node);
      if (name) out.push(decl(node, name, ["class"]));
      collectTsMethods(node, out);
      return;
    }
    case "interface_declaration": {
      const name = nameOf(node);
      if (name) out.push(decl(node, name, ["interface"]));
      return;
    }
    case "type_alias_declaration": {
      const name = nameOf(node);
      if (name) out.push(decl(node, name, ["type"]));
      return;
    }
    case "enum_declaration": {
      const name = nameOf(node);
      if (name) out.push(decl(node, name, ["enum"]));
      return;
    }
    case "lexical_declaration":
    case "variable_declaration": {
      const keyword = node.child(0)?.text; // const | let | var
      for (const child of node.namedChildren) {
        if (child.type !== "variable_declarator") continue;
        const name = nameOf(child);
        if (!name) continue;
        const valueType = child.childForFieldName("value")?.type ?? "";
        const kinds: SymbolKind[] = TS_FUNCTION_VALUES.has(valueType)
          ? ["function"]
          : keyword === "const"
            ? ["constant"]
            : ["variable"];
        out.push(decl(child, name, kinds));
      }
      return;
    }
  }
}

function collectTsMethods(classNode: Node, out: SymbolDecl[]): void {
  const body = classNode.childForFieldName("body");
  if (!body) return;
  for (const member of body.namedChildren) {
    if (member.type !== "method_definition") continue;
    const name = nameOf(member);
    if (name) out.push(decl(member, name, ["method"]));
  }
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

function extractPython(root: Node): SymbolDecl[] {
  const out: SymbolDecl[] = [];
  for (const top of root.namedChildren) {
    const node = unwrapPyDecorated(top);
    switch (node.type) {
      case "function_definition": {
        const name = nameOf(node);
        if (name) out.push(decl(node, name, ["function"]));
        break;
      }
      case "class_definition": {
        const name = nameOf(node);
        if (name) out.push(decl(node, name, ["class"]));
        collectPyMethods(node, out);
        break;
      }
      case "expression_statement": {
        collectPyAssignment(node, out);
        break;
      }
    }
  }
  return out;
}

function unwrapPyDecorated(node: Node): Node {
  if (node.type !== "decorated_definition") return node;
  return node.childForFieldName("definition") ?? node.lastNamedChild ?? node;
}

function collectPyMethods(classNode: Node, out: SymbolDecl[]): void {
  const body = classNode.childForFieldName("body");
  if (!body) return;
  for (const member of body.namedChildren) {
    const node = unwrapPyDecorated(member);
    if (node.type !== "function_definition") continue;
    const name = nameOf(node);
    if (name) out.push(decl(node, name, ["method"]));
  }
}

function collectPyAssignment(exprStmt: Node, out: SymbolDecl[]): void {
  const assignment = exprStmt.namedChild(0);
  if (!assignment || assignment.type !== "assignment") return;
  const left = assignment.childForFieldName("left");
  // Only a plain `name = ...` (or `name: T = ...`) target is a declaration we can
  // verify structurally. Tuple/attribute/subscript targets are out of scope.
  if (!left || left.type !== "identifier") return;
  // Python cannot structurally distinguish constant from variable (that is naming
  // convention — semantic), so the binding satisfies both.
  out.push(decl(assignment, left.text, ["constant", "variable"]));
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

function extractGo(root: Node): SymbolDecl[] {
  const out: SymbolDecl[] = [];
  for (const top of root.namedChildren) {
    switch (top.type) {
      case "function_declaration": {
        const name = nameOf(top);
        if (name) out.push(decl(top, name, ["function"]));
        break;
      }
      case "method_declaration": {
        const name = nameOf(top);
        if (name) out.push(decl(top, name, ["method"]));
        break;
      }
      case "type_declaration": {
        for (const spec of top.namedChildren) collectGoType(spec, out);
        break;
      }
      case "const_declaration": {
        collectGoValueSpecs(top, out, "constant");
        break;
      }
      case "var_declaration": {
        collectGoValueSpecs(top, out, "variable");
        break;
      }
    }
  }
  return out;
}

function collectGoType(spec: Node, out: SymbolDecl[]): void {
  if (spec.type !== "type_spec" && spec.type !== "type_alias") return;
  const name = nameOf(spec);
  if (!name) return;
  const inner = spec.childForFieldName("type")?.type;
  const kinds: SymbolKind[] =
    spec.type === "type_alias"
      ? ["type"]
      : inner === "struct_type"
        ? ["struct"]
        : inner === "interface_type"
          ? ["interface"]
          : ["type"];
  out.push(decl(spec, name, kinds));
}

function collectGoValueSpecs(group: Node, out: SymbolDecl[], kind: SymbolKind): void {
  for (const spec of group.namedChildren) {
    if (spec.type !== "const_spec" && spec.type !== "var_spec") continue;
    // A spec may bind several names (`const A, B = ...`).
    for (const nameNode of spec.childrenForFieldName("name")) {
      out.push(decl(spec, nameNode.text, [kind]));
    }
  }
}
