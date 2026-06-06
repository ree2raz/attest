import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { applyFileDiff, findFile } from "@attest/diff";
import type { ParsedDiff } from "@attest/diff";
import { extractSymbols, langFromPath } from "@attest/symbols";
import type { SymbolDecl } from "@attest/symbols";

/**
 * Provides each file's pre-change (base) and post-change content and symbol sets,
 * cached per verification run.
 *
 * The diff applies to `repoRoot`'s pre-change state, so base content is read from
 * disk and post content is reconstructed deterministically via `applyFileDiff`
 * (SPEC §6.2 "reconstruct from base + diff") — no worktree needed for structural
 * verification. A symbol-less language (path not recognized) yields `[]`.
 */
export class Sources {
  private readonly baseContentCache = new Map<string, Promise<string | null>>();
  private readonly baseSymbolsCache = new Map<string, Promise<SymbolDecl[]>>();
  private readonly postSymbolsCache = new Map<string, Promise<SymbolDecl[]>>();

  constructor(
    private readonly repoRoot: string,
    private readonly diff: ParsedDiff,
  ) {}

  /** Pre-change content read from `repoRoot`; null if the file does not exist there. */
  baseContent(path: string): Promise<string | null> {
    let cached = this.baseContentCache.get(path);
    if (!cached) {
      cached = readFile(join(this.repoRoot, path), "utf8").catch(() => null);
      this.baseContentCache.set(path, cached);
    }
    return cached;
  }

  /**
   * Post-change content: reconstructed from base + diff when the file changed,
   * the base content when it did not, or null when the diff deletes it.
   */
  async postContent(path: string): Promise<string | null> {
    const file = findFile(this.diff, path);
    const base = await this.baseContent(path);
    if (!file) return base;
    if (file.op === "delete") return null;
    return applyFileDiff(base ?? "", file);
  }

  baseSymbols(path: string): Promise<SymbolDecl[]> {
    return this.cachedSymbols(this.baseSymbolsCache, path, () => this.baseContent(path));
  }

  postSymbols(path: string): Promise<SymbolDecl[]> {
    return this.cachedSymbols(this.postSymbolsCache, path, () => this.postContent(path));
  }

  private cachedSymbols(
    cache: Map<string, Promise<SymbolDecl[]>>,
    path: string,
    getContent: () => Promise<string | null>,
  ): Promise<SymbolDecl[]> {
    let cached = cache.get(path);
    if (!cached) {
      cached = (async () => {
        const lang = langFromPath(path);
        if (!lang) return [];
        const content = await getContent();
        if (content === null) return [];
        return extractSymbols(lang, content);
      })();
      cache.set(path, cached);
    }
    return cached;
  }
}
