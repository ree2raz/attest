import type { Verdict, ClaimResult, UndeclaredChange } from "@attest/schema";
import type { Manifest } from "@attest/schema";

const C = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
} as const;

function col(s: string, code: string, use: boolean): string {
  return use ? `${code}${s}${C.reset}` : s;
}

function claimLine(r: ClaimResult, manifest: Manifest, useColor: boolean): string {
  const claim = manifest.claims.find((c) => c.id === r.id);
  const kindStr = claim ? claim.kind : r.id;

  let detail = "";
  if (claim) {
    if ("path" in claim && "op" in claim) detail = `${claim.op}  ${claim.path}`;
    else if ("symbol" in claim && "path" in claim && "symbol_kind" in claim)
      detail = `${claim.symbol} (${claim.symbol_kind})  ${claim.path}`;
    else if ("path" in claim && "covers" in claim)
      detail = `${claim.path}${claim.covers ? `  covers: ${claim.covers}` : ""}`;
    else if ("path" in claim) detail = String(claim.path);
    else if ("check" in claim) detail = String(claim.check);
  }

  let icon: string;
  if (r.status === "verified") icon = col("✓", C.green, useColor);
  else if (r.status === "failed") icon = col("✗", C.red, useColor);
  else icon = col("~", C.cyan, useColor);

  const tail =
    r.status !== "verified" && r.reason
      ? col(`  → ${r.reason}`, r.status === "failed" ? C.red : C.cyan, useColor)
      : "";

  return `  ${icon} ${r.id}  ${kindStr}  ${detail}${tail}`;
}

function undeclaredLine(u: UndeclaredChange, useColor: boolean): string {
  const icon = col("⚠", C.yellow, useColor);
  const sym = u.symbol ? `  symbol ${u.symbol} (${u.symbol_kind ?? "?"})` : "";
  return `  ${icon} ${u.path}${sym}  [${u.severity}]`;
}

export function renderHuman(verdict: Verdict, manifest: Manifest, useColor: boolean): string {
  const lines: string[] = [];

  const agentStr = [manifest.agent.id, manifest.agent.model].filter(Boolean).join(" · ");
  const toolCalls =
    manifest.agent.tool_calls !== undefined ? `, ${manifest.agent.tool_calls} tool calls` : "";

  lines.push(col(`attest v${verdict.attest_version}`, C.bold, useColor));
  lines.push(`Task: ${manifest.task.id}  —  ${manifest.task.description}`);
  lines.push(`Agent: ${agentStr}${toolCalls}`);
  lines.push("");

  // Claims
  lines.push(`Claims (${verdict.claims.length}):`);
  for (const r of verdict.claims) {
    lines.push(claimLine(r, manifest, useColor));
  }

  // Undeclared changes
  const flagged = verdict.undeclared_changes.filter((u) => u.severity === "flag");
  const suppressed = verdict.undeclared_changes.filter((u) => u.severity === "suppressed");
  if (verdict.undeclared_changes.length > 0) {
    lines.push("");
    const suppressedNote = suppressed.length > 0 ? `, ${suppressed.length} suppressed` : "";
    lines.push(`Undeclared changes (${flagged.length} flagged${suppressedNote}):`);
    for (const u of verdict.undeclared_changes) {
      lines.push(undeclaredLine(u, useColor));
    }
  }

  // Summary
  lines.push("");
  const s = verdict.summary;
  lines.push(
    `Summary: ${s.verified} verified · ${s.failed} failed · ${s.unverifiable} unverifiable · ${s.undeclared} undeclared`,
  );

  const resultStr =
    verdict.result === "pass" ? col("PASS", C.green, useColor) : col("FAIL", C.red, useColor);
  lines.push(`Result: ${resultStr}`);
  lines.push("");

  return lines.join("\n");
}
