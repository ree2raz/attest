import { describe, expect, it } from "vitest";
import { parseDiff } from "../src/index.js";

describe("parseDiff", () => {
  it("returns no files for an empty diff", () => {
    expect(parseDiff("")).toEqual({ files: [] });
    expect(parseDiff("   \n\n")).toEqual({ files: [] });
  });

  it("parses a modify with one hunk and correct line numbers", () => {
    const diff = [
      "diff --git a/src/auth.ts b/src/auth.ts",
      "index db03973..a2d2cb1 100644",
      "--- a/src/auth.ts",
      "+++ b/src/auth.ts",
      "@@ -5,3 +5,7 @@ export function hashToken(token: string): string {",
      "   }",
      "   return (h >>> 0).toString(16);",
      " }",
      "+",
      "+export function login(user: string, token: string): boolean {",
      "+  return user.length > 0 && hashToken(token).length > 0;",
      "+}",
      "",
    ].join("\n");

    const { files } = parseDiff(diff);
    expect(files).toHaveLength(1);
    const f = files[0]!;
    expect(f.op).toBe("modify");
    expect(f.path).toBe("src/auth.ts");
    expect(f.oldPath).toBe("src/auth.ts");
    expect(f.newPath).toBe("src/auth.ts");
    expect(f.binary).toBe(false);
    expect(f.hunks).toHaveLength(1);

    const h = f.hunks[0]!;
    expect(h).toMatchObject({ oldStart: 5, oldLines: 3, newStart: 5, newLines: 7 });
    expect(h.header).toBe("export function hashToken(token: string): string {");

    const adds = h.lines.filter((l) => l.type === "add");
    expect(adds).toHaveLength(4);
    // First context line is old line 5 / new line 5; first add is new line 8.
    const firstContext = h.lines.find((l) => l.type === "context")!;
    expect(firstContext).toMatchObject({ oldLine: 5, newLine: 5 });
    expect(adds.map((l) => l.newLine)).toEqual([8, 9, 10, 11]);
    expect(adds.every((l) => l.oldLine === null)).toBe(true);
  });

  it("classifies a new file as create with /dev/null old side", () => {
    const diff = [
      "diff --git a/tests/auth.test.ts b/tests/auth.test.ts",
      "new file mode 100644",
      "index 0000000..4b2868f",
      "--- /dev/null",
      "+++ b/tests/auth.test.ts",
      "@@ -0,0 +1,2 @@",
      "+import { login } from '../src/auth.js';",
      "+export const x = 1;",
      "",
    ].join("\n");

    const { files } = parseDiff(diff);
    expect(files).toHaveLength(1);
    const f = files[0]!;
    expect(f.op).toBe("create");
    expect(f.path).toBe("tests/auth.test.ts");
    expect(f.oldPath).toBeNull();
    expect(f.newPath).toBe("tests/auth.test.ts");
    expect(f.hunks[0]!.lines.every((l) => l.type === "add")).toBe(true);
  });

  it("classifies a deleted file as delete with /dev/null new side", () => {
    const diff = [
      "diff --git a/src/old.ts b/src/old.ts",
      "deleted file mode 100644",
      "index 4b2868f..0000000",
      "--- a/src/old.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-export const a = 1;",
      "-export const b = 2;",
      "",
    ].join("\n");

    const f = parseDiff(diff).files[0]!;
    expect(f.op).toBe("delete");
    expect(f.path).toBe("src/old.ts");
    expect(f.oldPath).toBe("src/old.ts");
    expect(f.newPath).toBeNull();
    expect(f.hunks[0]!.lines.every((l) => l.type === "del")).toBe(true);
  });

  it("surfaces a rename as delete(old) + create(new)", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/b.ts",
      "similarity index 100%",
      "rename from src/a.ts",
      "rename to src/b.ts",
      "",
    ].join("\n");

    const { files } = parseDiff(diff);
    expect(files.map((f) => [f.op, f.path])).toEqual([
      ["delete", "src/a.ts"],
      ["create", "src/b.ts"],
    ]);
  });

  it("marks binary files and leaves hunks empty", () => {
    const diff = [
      "diff --git a/logo.png b/logo.png",
      "index 1111111..2222222 100644",
      "Binary files a/logo.png and b/logo.png differ",
      "",
    ].join("\n");

    const f = parseDiff(diff).files[0]!;
    expect(f.binary).toBe(true);
    expect(f.op).toBe("modify");
    expect(f.hunks).toEqual([]);
  });

  it("parses multiple files in one diff in order", () => {
    const diff = [
      "diff --git a/one.ts b/one.ts",
      "--- a/one.ts",
      "+++ b/one.ts",
      "@@ -1 +1,2 @@",
      " a",
      "+b",
      "diff --git a/two.ts b/two.ts",
      "--- a/two.ts",
      "+++ b/two.ts",
      "@@ -1 +1,2 @@",
      " c",
      "+d",
      "",
    ].join("\n");

    expect(parseDiff(diff).files.map((f) => f.path)).toEqual(["one.ts", "two.ts"]);
  });

  it("defaults omitted hunk counts to 1", () => {
    const diff = [
      "diff --git a/x b/x",
      "--- a/x",
      "+++ b/x",
      "@@ -3 +3 @@",
      "-old",
      "+new",
      "",
    ].join("\n");
    const h = parseDiff(diff).files[0]!.hunks[0]!;
    expect(h).toMatchObject({ oldStart: 3, oldLines: 1, newStart: 3, newLines: 1 });
  });
});
