import { Cli, Builtins } from "clipanion";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setGrammarsDir } from "@attest/symbols";
import { VerifyCommand } from "./commands/verify.js";
import { InitCommand } from "./commands/init.js";
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

// WU11: bundled CLI override. When the @attest/symbols module is bundled into
// this file, `import.meta.url` in the symbols loader points here — but the
// grammar .wasm files live in a sibling `grammars/` directory next to the
// bundled `dist/`. Set the override before any command runs. Falls back to the
// default (unbundled) path for monorepo-from-source usage.
{
  const cliGrammars = join(__dirname, "..", "grammars");
  if (existsSync(cliGrammars)) {
    setGrammarsDir(cliGrammars);
  }
}

const cli = new Cli({
  binaryLabel: "attest",
  binaryName: "attest",
  binaryVersion: version,
});

cli.register(VerifyCommand);
cli.register(InitCommand);
cli.register(SchemaCommand);
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

cli.runExit(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
});
