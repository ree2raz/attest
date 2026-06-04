import { Command, Option } from "clipanion";
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { text } from "node:stream/consumers";
import { createValidator } from "@attest/schema";
import { verify, parseDiffContent } from "@attest/core";
import { registerDetectors } from "@attest/detectors-ts";
import { renderHuman } from "../render/human.js";
import { renderJson } from "../render/json.js";

// Exit codes per spec
const EX_DATAERR = 65;
const EX_NOINPUT = 66;
const EX_INTERNAL = 70;

export class VerifyCommand extends Command {
  static override paths = [["verify"]];

  static override usage = Command.Usage({
    description: "Verify an agent manifest against a diff",
    examples: [
      ["Verify using files", "attest verify --manifest manifest.json --diff changes.diff"],
      ["Verify with stdin diff", "attest verify --manifest manifest.json --diff -"],
    ],
  });

  manifest = Option.String("--manifest,-m", {
    required: true,
    description: "Path to manifest JSON",
  });
  diff = Option.String("--diff,-d", {
    required: true,
    description: "Path to unified diff file, or - for stdin",
  });
  repoRoot = Option.String("--repo-root,-r", {
    required: false,
    description: "Repository root (default: cwd)",
  });
  format = Option.String("--format,-f", "human", { description: "Output format: human or json" });
  noColor = Option.Boolean("--no-color", false, { description: "Disable ANSI color" });
  verbose = Option.Boolean("--verbose,-v", false, { description: "Verbose stderr output" });

  override async execute(): Promise<number> {
    const { stderr: out } = this.context;

    // ── Resolve repo root ────────────────────────────────────────────────
    const repoRoot = this.repoRoot ? resolve(this.repoRoot) : process.cwd();

    try {
      await access(repoRoot, constants.R_OK);
    } catch {
      out.write(`error: repo-root not found: ${repoRoot}\n`);
      return EX_NOINPUT;
    }

    // ── Read manifest ────────────────────────────────────────────────────
    const manifestPath = isAbsolute(this.manifest) ? this.manifest : resolve(this.manifest);

    let manifestRawBytes: Buffer;
    try {
      manifestRawBytes = await readFile(manifestPath);
    } catch {
      out.write(`error: manifest not found: ${manifestPath}\n`);
      return EX_NOINPUT;
    }

    let manifestObj: unknown;
    try {
      manifestObj = JSON.parse(manifestRawBytes.toString("utf-8"));
    } catch (e) {
      out.write(`error: manifest JSON parse error: ${String(e)}\n`);
      return EX_DATAERR;
    }

    // Validate manifest schema
    const validator = createValidator();
    const result = validator.validate(manifestObj);
    if (!result.ok) {
      for (const err of result.errors) {
        out.write(`${err.instancePath}: ${err.keyword}: ${err.message}\n`);
      }
      return 2;
    }
    const manifest = result.manifest;

    // ── Read diff ────────────────────────────────────────────────────────
    let diffText: string;
    if (this.diff === "-") {
      try {
        diffText = await text(process.stdin);
      } catch (e) {
        out.write(`error: failed to read diff from stdin: ${String(e)}\n`);
        return EX_DATAERR;
      }
    } else {
      const diffPath = isAbsolute(this.diff) ? this.diff : resolve(this.diff);
      try {
        diffText = await readFile(diffPath, "utf-8");
      } catch {
        out.write(`error: diff file not found: ${diffPath}\n`);
        return EX_NOINPUT;
      }
    }

    const diffSet = parseDiffContent(diffText);
    if (diffSet.changes.length === 0) {
      out.write("error: diff contains no changes\n");
      return EX_DATAERR;
    }

    // ── Run verifier ─────────────────────────────────────────────────────
    const detectors = registerDetectors();
    if (this.verbose) {
      for (const d of detectors) {
        out.write(`verbose: registered detector: ${d.id}\n`);
      }
    }

    let report;
    try {
      report = await verify({
        manifest,
        manifestRawBytes: new Uint8Array(manifestRawBytes),
        diff: diffSet,
        repoRoot,
        detectors,
      });
    } catch (e) {
      out.write(`error: internal verifier error: ${String(e)}\n`);
      return EX_INTERNAL;
    }

    // ── Render output ─────────────────────────────────────────────────────
    const useColor =
      !this.noColor &&
      !process.env["NO_COLOR"] &&
      this.context.stdout.hasColors !== undefined &&
      (this.context.stdout as NodeJS.WriteStream).isTTY === true;

    let output: string;
    if (this.format === "json") {
      output = renderJson(report);
    } else {
      output = renderHuman(report, manifest, useColor);
    }

    this.context.stdout.write(output);

    // ── Exit code ─────────────────────────────────────────────────────────
    const hasIssues =
      report.claims.some((c) => c.verdict === "unverified" || c.verdict === "partial") ||
      report.undeclared.length > 0;

    return hasIssues ? 1 : 0;
  }
}
