import { describe, expect, it } from "vitest";
import {
  diffSymbols,
  extractSymbols,
  langFromPath,
  locateSymbol,
  symbolMatches,
} from "../src/index.js";

describe("symbolMatches / locateSymbol", () => {
  it("matches on name and any satisfied kind", async () => {
    const syms = await extractSymbols("py", "X = 1\n");
    const x = syms[0]!;
    expect(symbolMatches(x, "X", "constant")).toBe(true);
    expect(symbolMatches(x, "X", "variable")).toBe(true);
    expect(symbolMatches(x, "X", "function")).toBe(false);
    expect(symbolMatches(x, "Y", "constant")).toBe(false);
  });

  it("returns undefined when no declaration matches", async () => {
    const syms = await extractSymbols("ts", "export function a() {}\n");
    expect(locateSymbol(syms, "a", "function")).toBeDefined();
    expect(locateSymbol(syms, "a", "class")).toBeUndefined();
    expect(locateSymbol(syms, "missing", "function")).toBeUndefined();
  });
});

describe("diffSymbols", () => {
  const before = `export function add(a: number, b: number) { return a + b; }
export function keep() { return 1; }
export function gone() { return 0; }`;

  it("reports added, removed, and modified declarations", async () => {
    const after = `export function add(a: number, b: number) { return a - b; }
export function keep() { return 1; }
export function fresh() { return 2; }`;

    const delta = diffSymbols(
      await extractSymbols("ts", before),
      await extractSymbols("ts", after),
    );

    expect(delta.added.map((s) => s.name)).toEqual(["fresh"]);
    expect(delta.removed.map((s) => s.name)).toEqual(["gone"]);
    expect(delta.modified.map((s) => s.name)).toEqual(["add"]); // body changed
  });

  it("reports no modification when the declaration text is identical", async () => {
    const delta = diffSymbols(
      await extractSymbols("ts", before),
      await extractSymbols("ts", before),
    );
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(delta.modified).toEqual([]);
  });
});

describe("langFromPath", () => {
  it("maps known extensions, routing JS to the TS grammar", () => {
    expect(langFromPath("src/auth.ts")).toBe("ts");
    expect(langFromPath("a/b/c.mts")).toBe("ts");
    expect(langFromPath("comp.tsx")).toBe("tsx");
    expect(langFromPath("legacy.js")).toBe("ts");
    expect(langFromPath("view.jsx")).toBe("tsx");
    expect(langFromPath("calc.py")).toBe("py");
    expect(langFromPath("calc.go")).toBe("go");
  });

  it("returns null for unsupported or extensionless paths", () => {
    expect(langFromPath("README.md")).toBeNull();
    expect(langFromPath("Makefile")).toBeNull();
    expect(langFromPath("go.sum")).toBeNull();
  });
});
