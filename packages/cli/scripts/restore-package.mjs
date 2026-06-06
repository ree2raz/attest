#!/usr/bin/env node
// WU11: restore the dev-time package.json after `npm pack` / `npm publish`.
// Runs from `postpack`.
import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, "..", "package.json");
const backupPath = join(__dirname, "..", ".package.json.dev");

if (!existsSync(backupPath)) {
  console.log("no backup to restore from; leaving package.json as-is");
  process.exit(0);
}

copyFileSync(backupPath, pkgPath);
unlinkSync(backupPath);
console.log(`restored ${pkgPath} from backup`);
