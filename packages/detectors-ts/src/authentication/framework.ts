import type { KnownFramework } from "./types.js";

/**
 * Imports we treat as "this file uses framework X". The regex is a quick
 * textual scan, not a parse — the real framework check is inside `chain.ts`
 * which uses ts-morph on the same file.
 */
const FRAMEWORK_IMPORTS: Array<{ pattern: string | RegExp; framework: KnownFramework }> = [
  { pattern: "express", framework: "express" },
  { pattern: "fastify", framework: "fastify" },
  { pattern: "@nestjs/common", framework: "nestjs" },
  { pattern: "@nestjs/core", framework: "nestjs" },
  { pattern: "koa", framework: "koa" },
  { pattern: "@koa/router", framework: "koa" },
  { pattern: "http", framework: "rawnode" },
  { pattern: "https", framework: "rawnode" },
  { pattern: "node:http", framework: "rawnode" },
  { pattern: "node:https", framework: "rawnode" },
];

/**
 * Cheap pre-flight check: does the file's source mention any recognisable
 * framework import? Used as a gate before paying the ts-morph parse cost.
 * Returns `null` for `unknown`, in which case the detector short-circuits
 * to `advisory_inconclusive` with `reason_code: "framework_unsupported"`.
 */
export function detectFramework(content: string): KnownFramework | null {
  for (const { pattern, framework } of FRAMEWORK_IMPORTS) {
    const escaped =
      typeof pattern === "string" ? pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : pattern.source;
    const re = new RegExp(`from\\s+["']${escaped}["']`);
    if (re.test(content)) return framework;
  }
  return null;
}
