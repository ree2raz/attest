import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectAuthentication } from "../src/authentication/index.js";
import type { Claim } from "@attest/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "fixtures", "authentication");

interface ExpectedResult {
  verdict: string;
  reason_code: string | null;
  evidence_contains: string[];
}

function loadFixture(name: string): { content: string; expected: ExpectedResult } {
  const content = readFileSync(join(FIXTURES_DIR, `${name}.ts`), "utf-8");
  const expected = JSON.parse(
    readFileSync(join(FIXTURES_DIR, `${name}.expected.json`), "utf-8"),
  ) as ExpectedResult;
  return { content, expected };
}

function makeClaim(symbol: string, path: string): Claim {
  return {
    id: "c1",
    type: "modify_behavior",
    target: { kind: "endpoint", path, symbol },
    description: "auth check",
    verification_contract: {
      check: "behavior_present",
      params: { property: "authentication" },
    },
  };
}

function makeNestClaim(symbol: string, path: string): Claim {
  return {
    id: "c1",
    type: "add_symbol",
    target: { kind: "endpoint", path, symbol },
    description: "auth check",
    verification_contract: {
      check: "behavior_present",
      params: { property: "authentication" },
    },
  };
}

async function runFixture(name: string, symbol: string, isNest = false) {
  const { content, expected } = loadFixture(name);
  const claim = isNest ? makeNestClaim(symbol, `${name}.ts`) : makeClaim(symbol, `${name}.ts`);
  const result = await detectAuthentication(claim, {
    repoRoot: FIXTURES_DIR,
    postDiffFile: async () => content,
  });

  return { result, expected };
}

const FIXTURES: Array<{ name: string; symbol: string; isNest?: boolean }> = [
  { name: "express-route-level-valid", symbol: "POST /x" },
  { name: "express-app-level-valid", symbol: "POST /x" },
  { name: "express-no-auth", symbol: "POST /x" },
  { name: "express-passport-import", symbol: "POST /x" },
  { name: "fastify-preHandler-valid", symbol: "POST /x" },
  { name: "fastify-addHook-valid", symbol: "POST /x" },
  { name: "fastify-no-auth", symbol: "POST /x" },
  { name: "nestjs-method-guard-valid", symbol: "ItemsController.create", isNest: true },
  { name: "nestjs-class-guard-valid", symbol: "ItemsController.create", isNest: true },
  { name: "nestjs-no-guard", symbol: "ItemsController.create", isNest: true },
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
  for (const { name, symbol, isNest } of FIXTURES) {
    it(name, async () => {
      const { result, expected } = await runFixture(name, symbol, isNest);

      expect(result.verdict).toBe(expected.verdict);
      expect(result.reason_code ?? null).toBe(expected.reason_code);

      const evidenceText = result.evidence.map((e) => JSON.stringify(e)).join(" ");
      for (const fragment of expected.evidence_contains) {
        expect(evidenceText).toContain(fragment);
      }
    });
  }
});

describe("detectAuthentication — invalid claim shape", () => {
  it("rejects non-endpoint target kind", async () => {
    const claim: Claim = {
      id: "c1",
      type: "add_symbol",
      target: { kind: "function", path: "src/foo.ts", symbol: "foo" },
      description: "test",
      verification_contract: { check: "behavior_present", params: { property: "authentication" } },
    };
    const result = await detectAuthentication(claim, {
      repoRoot: "/tmp",
      postDiffFile: async () => null,
    });
    expect(result.verdict).toBe("unverifiable");
    expect(result.reason_code).toBe("invalid_claim_shape");
  });

  it("rejects missing symbol", async () => {
    const claim: Claim = {
      id: "c1",
      type: "modify_behavior",
      target: { kind: "endpoint", path: "src/foo.ts" },
      description: "test",
      verification_contract: { check: "behavior_present", params: { property: "authentication" } },
    };
    const result = await detectAuthentication(claim, {
      repoRoot: "/tmp",
      postDiffFile: async () => null,
    });
    expect(result.verdict).toBe("unverifiable");
    expect(result.reason_code).toBe("invalid_claim_shape");
  });

  it("returns framework_unsupported when no framework import", async () => {
    const claim = makeClaim("POST /x", "src/foo.ts");
    const result = await detectAuthentication(claim, {
      repoRoot: "/tmp",
      postDiffFile: async () => `export function handler() { return 1; }`,
    });
    expect(result.verdict).toBe("unverifiable");
    expect(result.reason_code).toBe("framework_unsupported");
  });

  it("returns parse_error when file not found", async () => {
    const claim = makeClaim("POST /x", "src/missing.ts");
    const result = await detectAuthentication(claim, {
      repoRoot: "/tmp",
      postDiffFile: async () => null,
    });
    expect(result.verdict).toBe("unverifiable");
    expect(result.reason_code).toBe("parse_error");
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
    const claim = makeClaim("POST /x", "src/test.ts");
    const result = await detectAuthentication(claim, {
      repoRoot: "/tmp",
      postDiffFile: async () => content,
    });
    expect(result.verdict).toBe("verified");
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
    const claim = makeClaim("POST /x", "src/test.ts");
    const result = await detectAuthentication(claim, {
      repoRoot: "/tmp",
      postDiffFile: async () => content,
    });
    expect(result.verdict).toBe("unverified");
    expect(result.reason_code).toBe("no_auth_in_chain");
  });
});
