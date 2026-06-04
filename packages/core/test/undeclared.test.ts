import { describe, it, expect } from "vitest";
import { computeUndeclaredFiles, extractTopLevelNames } from "../src/undeclared.js";
import { Project } from "ts-morph";

describe("computeUndeclaredFiles", () => {
  it("returns files in diff not in declared set", () => {
    const result = computeUndeclaredFiles(
      new Set(["src/foo.ts", "src/bar.ts"]),
      [],
      new Set(["src/foo.ts"]),
    );
    expect(result).toEqual(["src/bar.ts"]);
  });

  it("returns files in files_touched not declared", () => {
    const result = computeUndeclaredFiles(
      new Set(["src/foo.ts"]),
      ["src/hidden.ts"],
      new Set(["src/foo.ts"]),
    );
    expect(result).toEqual(["src/hidden.ts"]);
  });

  it("uses union of diff_paths and files_touched", () => {
    const result = computeUndeclaredFiles(
      new Set(["src/a.ts"]), // in diff only
      ["src/b.ts"], // in touched only
      new Set([]), // nothing declared
    );
    expect(result.sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("does not flag files in touched but absent from diff (no concern)", () => {
    // files_touched but absent from diff AND declared → not flagged
    const result = computeUndeclaredFiles(
      new Set([]), // diff is empty
      ["src/declared.ts"], // only touched
      new Set(["src/declared.ts"]), // declared
    );
    expect(result).toEqual([]);
  });

  it("returns empty array when all files declared", () => {
    const result = computeUndeclaredFiles(
      new Set(["src/a.ts", "src/b.ts"]),
      ["src/a.ts"],
      new Set(["src/a.ts", "src/b.ts"]),
    );
    expect(result).toEqual([]);
  });
});

describe("extractTopLevelNames", () => {
  function makeSourceFile(code: string) {
    const project = new Project({ useInMemoryFileSystem: true });
    return project.createSourceFile("temp.ts", code);
  }

  it("extracts function declarations", () => {
    const sf = makeSourceFile("export function foo() {}\nfunction bar() {}");
    expect(extractTopLevelNames(sf)).toContain("foo");
    expect(extractTopLevelNames(sf)).toContain("bar");
  });

  it("extracts class declarations", () => {
    const sf = makeSourceFile("export class MyService {}");
    expect(extractTopLevelNames(sf)).toContain("MyService");
  });

  it("extracts type aliases and interfaces", () => {
    const sf = makeSourceFile("type Foo = string;\ninterface Bar {}");
    const names = extractTopLevelNames(sf);
    expect(names).toContain("Foo");
    expect(names).toContain("Bar");
  });

  it("extracts const/let/var declarations", () => {
    const sf = makeSourceFile("export const handler = () => {};\nlet count = 0;");
    const names = extractTopLevelNames(sf);
    expect(names).toContain("handler");
    expect(names).toContain("count");
  });

  it("does not include names from inside function bodies", () => {
    const sf = makeSourceFile("function outer() { const inner = 1; }");
    const names = extractTopLevelNames(sf);
    expect(names).toContain("outer");
    expect(names).not.toContain("inner");
  });
});
