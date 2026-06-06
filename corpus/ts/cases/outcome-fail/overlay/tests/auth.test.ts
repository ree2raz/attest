import { describe, it, expect } from "vitest";
import { login } from "../src/auth.js";

describe("login", () => {
  it("wrongly expects empty credentials to succeed (this test fails on purpose)", () => {
    expect(login("", "")).toBe(true);
  });
});
