import { describe, expect, it } from "vitest";
import { extractSymbols, locateSymbol } from "../src/index.js";
import type { SymbolKind } from "../src/index.js";

async function kindsOf(lang: "ts" | "tsx" | "py" | "go", src: string, name: string) {
  const syms = await extractSymbols(lang, src);
  return syms.filter((s) => s.name === name).flatMap((s) => s.kinds);
}

describe("extractSymbols — TypeScript", () => {
  const src = `export function login(u: string): boolean { return u.length > 0; }
export const slugify = (x: string): string => x;
const slugifyExpr = function (x: string) { return x; };
class Service { handle(): void {} }
interface Repo { find(): void; }
type Id = string;
enum Color { Red, Green }
const MAX = 10;
let counter = 0;`;

  it("classifies each declaration by kind", async () => {
    const syms = await extractSymbols("ts", src);
    const byName = Object.fromEntries(syms.map((s) => [s.name, s.kind]));
    expect(byName).toMatchObject({
      login: "function",
      slugify: "function", // arrow assigned to const
      slugifyExpr: "function", // function expression
      Service: "class",
      handle: "method",
      Repo: "interface",
      Id: "type",
      Color: "enum",
      MAX: "constant",
      counter: "variable",
    });
  });

  it("records grammar node kind and 1-based line as evidence", async () => {
    const login = locateSymbol(await extractSymbols("ts", src), "login", "function");
    expect(login).toMatchObject({ nodeKind: "function_declaration", line: 1 });
  });

  it("does not collect locals declared inside a function body", async () => {
    const nested = `export function outer() {
  function inner() {}
  const helper = () => 1;
  return helper();
}`;
    const names = (await extractSymbols("ts", nested)).map((s) => s.name);
    expect(names).toEqual(["outer"]);
  });
});

describe("extractSymbols — TSX", () => {
  it("parses JSX and finds the component function", async () => {
    const src = `export function Button(): JSX.Element { return <button>ok</button>; }`;
    const btn = locateSymbol(await extractSymbols("tsx", src), "Button", "function");
    expect(btn?.nodeKind).toBe("function_declaration");
  });
});

describe("extractSymbols — Python", () => {
  const src = `def multiply(a, b):
    return a * b

class Calc:
    def add(self, a, b):
        return a + b

MAX = 10`;

  it("classifies functions, methods, and bindings", async () => {
    const syms = await extractSymbols("py", src);
    expect(locateSymbol(syms, "multiply", "function")?.nodeKind).toBe("function_definition");
    expect(locateSymbol(syms, "Calc", "class")).toBeDefined();
    expect(locateSymbol(syms, "add", "method")).toBeDefined();
  });

  it("treats a module-level binding as both constant and variable", async () => {
    const kinds = await kindsOf("py", src, "MAX");
    expect(kinds).toEqual(expect.arrayContaining<SymbolKind>(["constant", "variable"]));
  });

  it("handles a decorated function", async () => {
    const src = `@app.route("/")
def index():
    return "ok"`;
    expect(locateSymbol(await extractSymbols("py", src), "index", "function")).toBeDefined();
  });
});

describe("extractSymbols — Go", () => {
  const src = `package calc

func Multiply(a, b int) int { return a * b }

func (c Calc) Add(a, b int) int { return a + b }

type Point struct{ X int }
type Shape interface{ Area() float64 }
type Meters int
const Pi = 3
var Count = 0`;

  it("classifies funcs, methods, types, structs, interfaces, const, var", async () => {
    const syms = await extractSymbols("go", src);
    const byName = Object.fromEntries(syms.map((s) => [s.name, s.kind]));
    expect(byName).toMatchObject({
      Multiply: "function",
      Add: "method",
      Point: "struct",
      Shape: "interface",
      Meters: "type",
      Pi: "constant",
      Count: "variable",
    });
  });

  it("captures every name in a grouped const block", async () => {
    const src = `package c
const (
	A = 1
	B = 2
)`;
    const syms = await extractSymbols("go", src);
    expect(locateSymbol(syms, "A", "constant")).toBeDefined();
    expect(locateSymbol(syms, "B", "constant")).toBeDefined();
  });
});
