import { describe, it, expect } from "vitest";
import type { ParsedDiff } from "@attest/diff";
import { findRoutesInFile, runDetectors } from "../src/run-detectors.js";
import { DETECTOR_WARNINGS } from "../src/types.js";

function fileDiff(path: string, op: "create" | "modify" | "delete"): ParsedDiff["files"][number] {
  return {
    path,
    oldPath: op === "create" ? null : path,
    newPath: op === "delete" ? null : path,
    op,
    binary: false,
    hunks: [],
  };
}

function diff(...files: ParsedDiff["files"]): ParsedDiff {
  return { files };
}

describe("findRoutesInFile", () => {
  it("finds Express method calls", () => {
    const content = `
import express from "express";
const app = express();
app.get("/a", handler);
app.post("/b", handler);
`;
    expect(findRoutesInFile("src/server.ts", content).sort()).toEqual(["GET /a", "POST /b"]);
  });

  it("finds Fastify route() config objects", () => {
    const content = `
import fastify from "fastify";
const app = fastify();
app.route({ method: "POST", url: "/x", handler: h });
`;
    expect(findRoutesInFile("src/server.ts", content)).toEqual(["POST /x"]);
  });

  it("finds NestJS @Controller classes and HTTP methods", () => {
    const content = `
import { Controller, Post, Get } from "@nestjs/common";
@Controller("items")
export class ItemsController {
  @Post("/x") create() {}
  @Get() list() {}
}
`;
    expect(findRoutesInFile("src/items.controller.ts", content).sort()).toEqual([
      "ItemsController.create",
      "ItemsController.list",
    ]);
  });

  it("finds raw-Node req.method + req.url branches", () => {
    const content = `
import http from "http";
http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/x") {
    res.writeHead(200);
    res.end("ok");
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
  }
});
`;
    expect(findRoutesInFile("src/server.ts", content).sort()).toEqual(["GET /health", "POST /x"]);
  });

  it("returns an empty array when no routes are present", () => {
    expect(findRoutesInFile("src/util.ts", "export const x = 1;")).toEqual([]);
  });
});

describe("runDetectors", () => {
  it("returns an advisory for each discovered route", async () => {
    const content = `
import express from "express";
const app = express();
function auth(req: any, res: any, next: any) { next(); }
app.post("/x", auth, (req, res) => { res.json({}); });
app.get("/y", (req, res) => { res.json({}); });
`;
    const outputs = await runDetectors({
      diff: diff(fileDiff("src/server.ts", "modify")),
      repoRoot: "/nonexistent",
      readFile: async () => content,
    });
    expect(outputs).toHaveLength(2);
    expect(outputs.map((o) => o.symbol).sort()).toEqual(["GET /y", "POST /x"]);
    expect(outputs.every((o) => o.detector === "authentication")).toBe(true);
    expect(outputs.every((o) => o.warnings === DETECTOR_WARNINGS)).toBe(true);
  });

  it("preserves the advisory status mapping", async () => {
    const content = `
import express from "express";
const app = express();
app.get("/y", (req, res) => { res.json({}); });
`;
    const outputs = await runDetectors({
      diff: diff(fileDiff("src/server.ts", "modify")),
      repoRoot: "/nonexistent",
      readFile: async () => content,
    });
    expect(outputs).toHaveLength(1);
    const o = outputs[0]!;
    expect(o.status).toBe("advisory_absent");
    expect(o.reason_code).toBe("no_auth_in_chain");
  });

  it("skips delete operations", async () => {
    const outputs = await runDetectors({
      diff: diff(fileDiff("src/gone.ts", "delete")),
      repoRoot: "/nonexistent",
      readFile: async () => {
        throw new Error("readFile should not be called for delete");
      },
    });
    expect(outputs).toEqual([]);
  });

  it("skips non-source files", async () => {
    let readCalled = false;
    const outputs = await runDetectors({
      diff: diff(fileDiff("README.md", "modify")),
      repoRoot: "/nonexistent",
      readFile: async () => {
        readCalled = true;
        return "# readme";
      },
    });
    expect(outputs).toEqual([]);
    expect(readCalled).toBe(false);
  });

  it("skips files whose readFile returns null", async () => {
    const outputs = await runDetectors({
      diff: diff(fileDiff("src/missing.ts", "modify")),
      repoRoot: "/nonexistent",
      readFile: async () => null,
    });
    expect(outputs).toEqual([]);
  });

  it("marks unsupported-framework files as advisory_inconclusive", async () => {
    const content = `export function f() { return 1; }`;
    const outputs = await runDetectors({
      diff: diff(fileDiff("src/util.ts", "modify")),
      repoRoot: "/nonexistent",
      readFile: async () => content,
    });
    expect(outputs).toEqual([]);
  });
});
