import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectAuthentication } from "../src/authentication/index.js";
import type { DetectorStatus } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "fixtures", "authentication");

interface ExpectedResult {
  /** v0.1 verdict vocabulary — translated to the v0.2 advisory `status` at test time. */
  verdict: "verified" | "unverified" | "partial";
  reason_code: string | null;
  evidence_contains: string[];
}

const VERDICT_TO_STATUS: Record<ExpectedResult["verdict"], DetectorStatus> = {
  verified: "advisory_present",
  unverified: "advisory_absent",
  partial: "advisory_inconclusive",
};

function loadFixture(name: string): { content: string; expected: ExpectedResult } {
  const content = readFileSync(join(FIXTURES_DIR, `${name}.ts`), "utf-8");
  const expected = JSON.parse(
    readFileSync(join(FIXTURES_DIR, `${name}.expected.json`), "utf-8"),
  ) as ExpectedResult;
  return { content, expected };
}

const FIXTURES: Array<{ name: string; symbol: string }> = [
  { name: "express-route-level-valid", symbol: "POST /x" },
  { name: "express-app-level-valid", symbol: "POST /x" },
  { name: "express-no-auth", symbol: "POST /x" },
  { name: "express-passport-import", symbol: "POST /x" },
  { name: "fastify-preHandler-valid", symbol: "POST /x" },
  { name: "fastify-addHook-valid", symbol: "POST /x" },
  { name: "fastify-no-auth", symbol: "POST /x" },
  { name: "nestjs-method-guard-valid", symbol: "ItemsController.create" },
  { name: "nestjs-class-guard-valid", symbol: "ItemsController.create" },
  { name: "nestjs-no-guard", symbol: "ItemsController.create" },
  { name: "koa-app-use-valid", symbol: "POST /x" },
  { name: "koa-router-level-valid", symbol: "POST /x" },
  { name: "koa-no-auth", symbol: "POST /x" },
  { name: "raw-node-token-check-valid", symbol: "POST /x" },
  { name: "raw-node-no-check", symbol: "POST /x" },
  { name: "ambiguous-custom-middleware", symbol: "POST /x" },
  { name: "target-not-found", symbol: "POST /missing" },
  { name: "fastify-route-object-valid", symbol: "POST /x" },
];

describe("detectAuthentication — fixture suite", () => {
  for (const { name, symbol } of FIXTURES) {
    it(name, async () => {
      const { content, expected } = loadFixture(name);
      const output = await detectAuthentication({
        path: `${name}.ts`,
        symbol,
        content,
      });

      const expectedStatus = VERDICT_TO_STATUS[expected.verdict];
      expect(output.detector).toBe("authentication");
      expect(output.path).toBe(`${name}.ts`);
      expect(output.symbol).toBe(symbol);
      expect(output.status).toBe(expectedStatus);
      expect(output.reason_code ?? null).toBe(expected.reason_code);

      const evidenceText = output.evidence.map((e) => JSON.stringify(e)).join(" ");
      for (const fragment of expected.evidence_contains) {
        expect(evidenceText).toContain(fragment);
      }

      // Every output carries the advisory warnings (SPEC §6.5).
      expect(output.warnings.length).toBeGreaterThan(0);
      expect(output.warnings.join(" ")).toMatch(/best-effort/);
      expect(output.warnings.join(" ")).toMatch(/not part of the core verdict/);
    });
  }
});

describe("detectAuthentication — framework detection", () => {
  it("returns framework_unsupported when no framework import is present", async () => {
    const output = await detectAuthentication({
      path: "src/foo.ts",
      symbol: "POST /x",
      content: `export function handler() { return 1; }`,
    });
    expect(output.status).toBe("advisory_inconclusive");
    expect(output.reason_code).toBe("framework_unsupported");
    expect(output.framework).toBe("unknown");
  });
});

describe("detectAuthentication — Layer 1 prefix+suffix", () => {
  it("classifies checkJwt as auth via Layer 1 (check + jwt prefix combo)", async () => {
    const content = `
import express from "express";
const app = express();
function checkJwt(req: any, res: any, next: any) { next(); }
app.post("/x", checkJwt, (req, res) => { res.json({}); });
`;
    const output = await detectAuthentication({
      path: "src/test.ts",
      symbol: "POST /x",
      content,
    });
    expect(output.status).toBe("advisory_present");
  });
});

describe("detectAuthentication — negative list middleware", () => {
  it("classifies bodyParser as not-auth", async () => {
    const content = `
import express from "express";
const app = express();
app.use(express.json());
app.post("/x", (req, res) => { res.json({}); });
`;
    const output = await detectAuthentication({
      path: "src/test.ts",
      symbol: "POST /x",
      content,
    });
    expect(output.status).toBe("advisory_absent");
    expect(output.reason_code).toBe("no_auth_in_chain");
  });
});
