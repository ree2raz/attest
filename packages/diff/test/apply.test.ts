import { describe, expect, it } from "vitest";
import { applyFileDiff, parseDiff } from "../src/index.js";

function single(diff: string) {
  const f = parseDiff(diff).files[0];
  if (!f) throw new Error("expected one file in diff");
  return f;
}

describe("applyFileDiff", () => {
  it("reconstructs a modify by appending added lines after context", () => {
    const base = "def add(a, b):\n    return a + b\n";
    const diff = [
      "diff --git a/calc.py b/calc.py",
      "--- a/calc.py",
      "+++ b/calc.py",
      "@@ -1,2 +1,4 @@",
      " def add(a, b):",
      "     return a + b",
      "+",
      "+x = 1",
      "",
    ].join("\n");

    expect(applyFileDiff(base, single(diff))).toBe("def add(a, b):\n    return a + b\n\nx = 1\n");
  });

  it("reconstructs a create from an empty base", () => {
    const diff = [
      "diff --git a/new.ts b/new.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new.ts",
      "@@ -0,0 +1,2 @@",
      "+export const a = 1;",
      "+export const b = 2;",
      "",
    ].join("\n");

    expect(applyFileDiff("", single(diff))).toBe("export const a = 1;\nexport const b = 2;\n");
  });

  it("applies a deletion hunk by dropping removed lines", () => {
    const base = "keep1\nremove\nkeep2\n";
    const diff = [
      "diff --git a/x b/x",
      "--- a/x",
      "+++ b/x",
      "@@ -1,3 +1,2 @@",
      " keep1",
      "-remove",
      " keep2",
      "",
    ].join("\n");

    expect(applyFileDiff(base, single(diff))).toBe("keep1\nkeep2\n");
  });

  it("preserves untouched lines after the last hunk", () => {
    const base = "a\nb\nc\nd\n";
    const diff = [
      "diff --git a/x b/x",
      "--- a/x",
      "+++ b/x",
      "@@ -1 +1,2 @@",
      " a",
      "+inserted",
      "",
    ].join("\n");
    expect(applyFileDiff(base, single(diff))).toBe("a\ninserted\nb\nc\nd\n");
  });

  it("returns empty string for a delete op", () => {
    const diff = [
      "diff --git a/gone.ts b/gone.ts",
      "deleted file mode 100644",
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1,1 +0,0 @@",
      "-export const a = 1;",
      "",
    ].join("\n");
    expect(applyFileDiff("export const a = 1;\n", single(diff))).toBe("");
  });

  it("throws when context does not match the base (wrong base)", () => {
    const diff = [
      "diff --git a/x b/x",
      "--- a/x",
      "+++ b/x",
      "@@ -1,1 +1,2 @@",
      " expected-line",
      "+added",
      "",
    ].join("\n");
    expect(() => applyFileDiff("different-line\n", single(diff))).toThrow(/does not apply/);
  });
});
