import { Cli, Builtins } from "clipanion";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VerifyCommand } from "./commands/verify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from package.json
let version = "0.1.0";
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8")) as { version?: string };
  version = pkg.version ?? "0.1.0";
} catch {
  // fallback
}

const cli = new Cli({
  binaryLabel: "attest",
  binaryName: "attest",
  binaryVersion: version,
});

cli.register(VerifyCommand);
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

cli.runExit(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
});
