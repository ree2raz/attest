import { describe, it, expect } from "vitest";
import { login } from "../src/auth.js";

describe("login", () => {
  it("accepts a non-empty user and token", () => {
    expect(login("ada", "secret")).toBe(true);
  });
});
