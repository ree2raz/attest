#!/usr/bin/env node
// WU11: rewrite package.json for publish. Strips the @attest/* workspace deps
// (they're bundled into dist/) and the build-time scripts. The original dev
// package.json is restored by restore-package.mjs (postpack hook).
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, "..", "package.json");
const backupPath = join(__dirname, "..", ".package.json.dev");

// Back up the dev-time package.json (only if not already backed up).
copyFileSync(pkgPath, backupPath);

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

// Strip workspace deps — they're bundled into dist/index.js.
const publishedDeps = { ...(pkg.dependencies ?? {}) };
for (const name of Object.keys(publishedDeps)) {
  if (typeof publishedDeps[name] === "string" && publishedDeps[name].startsWith("workspace:")) {
    delete publishedDeps[name];
  }
}

const published = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  description: pkg.description,
  keywords: pkg.keywords,
  bin: pkg.bin,
  files: pkg.files,
  main: "./dist/index.js",
  exports: {
    ".": "./dist/index.js",
  },
  scripts: {},
  dependencies: publishedDeps,
  repository: pkg.repository,
  homepage: pkg.homepage,
  license: pkg.license,
  publishConfig: pkg.publishConfig,
  engines: pkg.engines,
};

writeFileSync(pkgPath, JSON.stringify(published, null, 2) + "\n", "utf-8");
console.log(`rewrote ${pkgPath} for pack (backup at ${backupPath})`);
