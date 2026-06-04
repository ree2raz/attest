import { describe, it, expect } from "vitest";
import { slugify } from "../src/format.js";

describe("slugify", () => {
  it("converts a phrase to a slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });
});
