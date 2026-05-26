import { describe, it, expect } from "vitest";
import { parseDiffContent } from "../src/diff.js";

const NEW_FILE_DIFF = `\
diff --git a/src/main.ts b/src/main.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/main.ts
@@ -0,0 +1,3 @@
+export function foo(): void {}
+
+export function bar(): void {}
`;

const MODIFIED_FILE_DIFF = `\
diff --git a/src/main.ts b/src/main.ts
index abc1234..def5678 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,2 +1,3 @@
 export function foo(): void {}
+export function bar(): void {}
`;

const DELETED_FILE_DIFF = `\
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export function old(): void {}
`;

const TWO_FILE_DIFF =
  NEW_FILE_DIFF +
  "\n" +
  `diff --git a/src/other.ts b/src/other.ts
index abc1234..def5678 100644
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,2 +1,3 @@
 export function foo(): void {}
+export function baz(): void {}
`;

describe("parseDiffContent", () => {
  it("parses a new file addition", () => {
    const result = parseDiffContent(NEW_FILE_DIFF);
    expect(result.changes).toHaveLength(1);
    const change = result.changes[0];
    expect(change).toBeDefined();
    expect(change!.path).toBe("src/main.ts");
    expect(change!.kind).toBe("added");
  });

  it("parses a modification", () => {
    const result = parseDiffContent(MODIFIED_FILE_DIFF);
    expect(result.changes).toHaveLength(1);
    const change = result.changes[0];
    expect(change).toBeDefined();
    expect(change!.path).toBe("src/main.ts");
    expect(change!.kind).toBe("modified");
  });

  it("parses a deletion", () => {
    const result = parseDiffContent(DELETED_FILE_DIFF);
    expect(result.changes).toHaveLength(1);
    const change = result.changes[0];
    expect(change).toBeDefined();
    expect(change!.path).toBe("src/old.ts");
    expect(change!.kind).toBe("deleted");
  });

  it("returns empty changes for empty diff string", () => {
    const result = parseDiffContent("");
    expect(result.changes).toHaveLength(0);
  });

  it("parses multiple files", () => {
    const result = parseDiffContent(TWO_FILE_DIFF);
    expect(result.changes).toHaveLength(2);
    const paths = result.changes.map((c) => c.path);
    expect(paths).toContain("src/main.ts");
    expect(paths).toContain("src/other.ts");
  });

  it("preserves hunks", () => {
    const result = parseDiffContent(NEW_FILE_DIFF);
    expect(result.changes[0]!.hunks.length).toBeGreaterThan(0);
  });
});
