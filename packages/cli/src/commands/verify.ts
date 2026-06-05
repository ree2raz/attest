import { Command, Option } from "clipanion";
import { readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { createManifestValidator } from "@attest/schema";
import { parseDiff } from "@attest/diff";
import { verify } from "@attest/core";
import { runOutcomes } from "@attest/runner";
import { renderHuman } from "../render/human.js";
import { renderJson } from "../render/json.js";
import { loadConfig } from "../config.js";

const EX_DATAERR = 65;
const EX_NOINPUT = 66;
const EX_INTERNAL = 70;

export class VerifyCommand extends Command {
  static override paths = [["verify"]];

  static override usage = Command.Usage({
    description: "Verify an agent manifest against a diff",
    examples: [
      ["Verify using files", "attest verify --manifest manifest.json --diff changes.diff"],
      ["Diff from stdin", "attest verify --manifest manifest.json --diff -"],
      ["Default diff (git diff HEAD)", "attest verify --manifest manifest.json --repo-root ."],
    ],
  });

  manifest = Option.String("--manifest,-m", {
    required: true,
    description: "Path to manifest JSON",
  });

  diff = Option.String("--diff,-d", {
    required: false,
    description: "Path to unified diff, or - for stdin. Defaults to git diff HEAD.",
  });

  repoRoot = Option.String("--repo-root,-r", {
    required: false,
    description: "Repository root (default: cwd)",
  });

  format = Option.String("--format,-f", "human", {
    description: "Output format: human or json",
  });

  noColor = Option.Boolean("--no-color", false, { description: "Disable ANSI color" });

  override async execute(): Promise<number> {
    const { stderr } = this.context;

    // ── Resolve repo root ────────────────────────────────────────────────────
    const repoRoot = this.repoRoot ? resolve(this.repoRoot) : process.cwd();
    try {
      await access(repoRoot, constants.R_OK);
    } catch {
      stderr.write(`error: repo-root not found: ${repoRoot}\n`);
      return EX_NOINPUT;
    }

    // ── Read manifest ────────────────────────────────────────────────────────
    const manifestPath = isAbsolute(this.manifest) ? this.manifest : resolve(this.manifest);
    let manifestRaw: string;
    try {
      manifestRaw = await readFile(manifestPath, "utf-8");
    } catch {
      stderr.write(`error: manifest not found: ${manifestPath}\n`);
      return EX_NOINPUT;
    }

    let manifestObj: unknown;
    try {
      manifestObj = JSON.parse(manifestRaw);
    } catch (e) {
      stderr.write(`error: manifest JSON parse error: ${String(e)}\n`);
      return EX_DATAERR;
    }

    const validator = createManifestValidator();
    const validation = validator.validate(manifestObj);
    if (!validation.ok) {
      for (const err of validation.errors) {
        stderr.write(`${err.path}: ${err.code}: ${err.message}\n`);
      }
      return EX_DATAERR;
    }
    const manifestData = validation.value;

    // ── Read diff ────────────────────────────────────────────────────────────
    let diffText: string;
    if (!this.diff) {
      try {
        diffText = execFileSync("git", ["diff", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
      } catch (e) {
        stderr.write(`error: could not run git diff HEAD: ${String(e)}\n`);
        return EX_INTERNAL;
      }
    } else if (this.diff === "-") {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
      }
      diffText = Buffer.concat(chunks).toString("utf-8");
    } else {
      const diffPath = isAbsolute(this.diff) ? this.diff : resolve(this.diff);
      try {
        diffText = await readFile(diffPath, "utf-8");
      } catch {
        stderr.write(`error: diff file not found: ${diffPath}\n`);
        return EX_NOINPUT;
      }
    }

    const parsedDiff = parseDiff(diffText);

    // ── Load config ──────────────────────────────────────────────────────────
    const { attestConfig, runnerConfig } = await loadConfig(repoRoot);

    // ── Run outcome checks (if any outcome claims exist) ─────────────────────
    const outcomeChecks = manifestData.claims
      .filter((c): c is typeof c & { kind: "outcome"; check: string } => c.kind === "outcome")
      .map((c) => c.check as Parameters<typeof runOutcomes>[0]["checks"][number]);

    let outcomes: Awaited<ReturnType<typeof runOutcomes>> | undefined;
    if (outcomeChecks.length > 0) {
      try {
        outcomes = await runOutcomes({
          repoRoot,
          checks: outcomeChecks,
          ...(diffText ? { diffText } : {}),
          ...(runnerConfig ? { config: runnerConfig } : {}),
        });
      } catch (e) {
        stderr.write(`warning: runner error (outcomes will be unverifiable): ${String(e)}\n`);
      }
    }

    // ── Verify ───────────────────────────────────────────────────────────────
    let verdict;
    try {
      verdict = await verify({
        manifest: manifestData,
        diff: parsedDiff,
        repoRoot,
        ...(attestConfig ? { config: attestConfig } : {}),
        ...(outcomes ? { outcomes } : {}),
      });
    } catch (e) {
      stderr.write(`error: verification failed: ${String(e)}\n`);
      return EX_INTERNAL;
    }

    // ── Render ───────────────────────────────────────────────────────────────
    const useColor =
      !this.noColor &&
      !process.env["NO_COLOR"] &&
      (this.context.stdout as NodeJS.WriteStream).isTTY === true;

    const output =
      this.format === "json" ? renderJson(verdict) : renderHuman(verdict, manifestData, useColor);

    this.context.stdout.write(output);
    return verdict.exit_code;
  }
}
