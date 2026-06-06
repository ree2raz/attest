import { Command, Option } from "clipanion";
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { resolve, isAbsolute, dirname } from "node:path";
import { parseDiff } from "@attest/diff";
import { extractSymbols, diffSymbols, langFromPath } from "@attest/symbols";
import type { SymbolDecl } from "@attest/symbols";
import { ATTEST_VERSION, type Claim, type SymbolKind } from "@attest/schema";

const EX_DATAERR = 65;
const EX_NOINPUT = 66;
const EX_INTERNAL = 70;

/**
 * `attest init` — produce a deterministic manifest skeleton from a diff.
 *
 * Same diff + same worktree state ⇒ same skeleton, byte-for-byte (modulo the
 * `task.id`, `agent.id`, and `generated_at` slots the user fills in). The
 * skeleton contains a `file_change` per touched file, `symbol_added` /
 * `symbol_removed` / `symbol_modified` derived from tree-sitter extraction
 * against `git show HEAD:<path>` (pre) and the current worktree (post), and
 * `test_added` / `test_modified` for files matching a path heuristic. It does
 * NOT generate `outcome` claims — those require running the build/test, which
 * is what `attest verify` does.
 */
export class InitCommand extends Command {
  static override paths = [["init"]];

  static override usage = Command.Usage({
    description: "Generate a manifest skeleton from a diff",
    examples: [
      ["Default (git diff HEAD against --repo-root)", "attest init"],
      ["From a diff file", "attest init --diff change.diff --repo-root ."],
      ["From stdin", "attest init --diff - --repo-root ."],
      ["Write to a custom path", "attest init --out manifest.json"],
    ],
  });

  diff = Option.String("--diff,-d", {
    required: false,
    description: "Path to unified diff, or - for stdin. Defaults to git diff HEAD.",
  });

  repoRoot = Option.String("--repo-root,-r", {
    required: false,
    description: "Repository root (default: cwd)",
  });

  out = Option.String("--out,-o", {
    required: false,
    description: "Output path for the manifest (default: .attest/manifest.json in repo-root)",
  });

  task = Option.String("--task", {
    required: false,
    description: "task.id to seed in the manifest (default: derive from diff scope)",
  });

  description = Option.String("--description", {
    required: false,
    description: "task.description to seed in the manifest (default: '<unspecified — fill in>')",
  });

  agent = Option.String("--agent", {
    required: false,
    description: "agent.id to seed in the manifest (default: 'attest-init')",
  });

  override async execute(): Promise<number> {
    const { stderr, stdout } = this.context;

    const repoRoot = this.repoRoot ? resolve(this.repoRoot) : process.cwd();
    try {
      await access(repoRoot, constants.R_OK);
    } catch {
      stderr.write(`error: repo-root not found: ${repoRoot}\n`);
      return EX_NOINPUT;
    }

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

    const parsed = parseDiff(diffText);
    if (parsed.files.length === 0) {
      stderr.write("error: diff is empty — nothing to generate a skeleton for\n");
      return EX_DATAERR;
    }

    const files = [...parsed.files].sort((a, b) => a.path.localeCompare(b.path));
    const allPaths: string[] = [];

    const claims: Claim[] = [];
    let claimCounter = 0;
    const nextId = (): string => {
      claimCounter += 1;
      return `c${claimCounter}`;
    };

    for (const file of files) {
      allPaths.push(file.path);

      claims.push({
        id: nextId(),
        kind: "file_change",
        op: file.op,
        path: file.path,
      });

      const lang = langFromPath(file.path);
      if (!lang) continue;
      if (file.binary) continue;

      const pre = file.op === "create" ? "" : await readGitHead(repoRoot, file.path);
      const post = file.op === "delete" ? "" : await readWorktree(repoRoot, file.path);
      if (pre === null && post === null) continue;

      const beforeDecls = pre === null ? [] : await safeExtract(lang, pre);
      const afterDecls = post === null ? [] : await safeExtract(lang, post);
      const delta = diffSymbols(beforeDecls, afterDecls);

      for (const decl of sortDecls(delta.added)) {
        claims.push({
          id: nextId(),
          kind: "symbol_added",
          path: file.path,
          symbol: decl.name,
          symbol_kind: primaryKind(decl.kinds),
        });
      }
      for (const decl of sortDecls(delta.removed)) {
        claims.push({
          id: nextId(),
          kind: "symbol_removed",
          path: file.path,
          symbol: decl.name,
          symbol_kind: primaryKind(decl.kinds),
        });
      }
      for (const decl of sortDecls(delta.modified)) {
        claims.push({
          id: nextId(),
          kind: "symbol_modified",
          path: file.path,
          symbol: decl.name,
          symbol_kind: primaryKind(decl.kinds),
        });
      }

      if (isTestPath(file.path)) {
        const kind: "test_added" | "test_modified" =
          file.op === "create" ? "test_added" : "test_modified";
        claims.push({
          id: nextId(),
          kind,
          path: file.path,
        });
      }
    }

    const manifest = {
      attest_version: ATTEST_VERSION,
      task: {
        id: this.task ?? deriveTaskId(files[0]?.path ?? "task"),
        description: this.description ?? "<unspecified — fill in>",
      },
      agent: { id: this.agent ?? "attest-init" },
      generated_at: new Date().toISOString(),
      declared_scope: { files: allPaths },
      claims,
    };

    const outPath = this.out
      ? isAbsolute(this.out)
        ? this.out
        : resolve(this.out)
      : resolve(repoRoot, ".attest", "manifest.json");

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

    stdout.write(`wrote ${claims.length} claim(s) across ${files.length} file(s) to ${outPath}\n`);
    stdout.write(
      `next: edit ${outPath} (add agent.model, fill task.description, add any 'outcome' checks), then run 'attest verify'.\n`,
    );
    return 0;
  }
}

async function readGitHead(repoRoot: string, path: string): Promise<string | null> {
  try {
    return execFileSync("git", ["show", `HEAD:${path}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

async function readWorktree(repoRoot: string, path: string): Promise<string | null> {
  try {
    return await readFile(resolve(repoRoot, path), "utf-8");
  } catch {
    return null;
  }
}

async function safeExtract(
  lang: ReturnType<typeof langFromPath>,
  source: string,
): Promise<SymbolDecl[]> {
  if (!lang) return [];
  try {
    return await extractSymbols(lang, source);
  } catch {
    return [];
  }
}

function primaryKind(kinds: readonly SymbolKind[]): SymbolKind {
  return kinds[0] ?? "function";
}

function sortDecls(decls: readonly SymbolDecl[]): SymbolDecl[] {
  return [...decls].sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.kind.localeCompare(b.kind);
  });
}

function isTestPath(path: string): boolean {
  return /(?:^|\/)(?:tests?|__tests__|spec)\//.test(path) || /\.(?:test|spec)\.[a-z]+$/i.test(path);
}

function deriveTaskId(firstPath: string): string {
  const stem = firstPath.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
  return stem || "task";
}
