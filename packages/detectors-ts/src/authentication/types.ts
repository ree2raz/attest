export type KnownFramework = "express" | "fastify" | "nestjs" | "koa" | "rawnode";

export type Classification = "auth" | "not-auth" | "unknown";

export interface ChainEntry {
  name: string;
  classification: Classification;
  layer: string;
}
