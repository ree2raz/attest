import { Cli, Builtins } from "clipanion";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VerifyCommand } from "./commands/verify.js";
import { SchemaCommand } from "./commands/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let version = "1.0.0";
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8")) as {
    version?: string;
  };
  version = pkg.version ?? "1.0.0";
} catch {
  // fallback
}

const cli = new Cli({
  binaryLabel: "attest",
  binaryName: "attest",
  binaryVersion: version,
});

cli.register(VerifyCommand);
cli.register(SchemaCommand);
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

cli.runExit(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
});
