import type { VerdictReport, ClaimResult } from "@attest/core";
import type { Manifest } from "@attest/schema";

// ─── ANSI helpers ─────────────────────────────────────────────────────────

type Color = "green" | "red" | "yellow" | "cyan" | "reset";

const ANSI: Record<Color, string> = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
};

function colorize(text: string, color: Color, useColor: boolean): string {
  if (!useColor) return text;
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

// ─── Icon + color per verdict ──────────────────────────────────────────────

const VERDICT_ICON: Record<string, string> = {
  verified: "✅",
  unverified: "❌",
  partial: "⚠️",
  unverifiable: "ⓘ",
};

const VERDICT_COLOR: Record<string, Color> = {
  verified: "green",
  unverified: "red",
  partial: "yellow",
  unverifiable: "cyan",
};

// ─── Evidence summarization (§5.3) ────────────────────────────────────────

function humanizeCode(code: string): string {
  return code.replace(/_/g, " ");
}

function evidenceSummary(claim: ClaimResult, manifest: Manifest): string {
  // Rule 1: first evidence entry with a non-empty note
  for (const ev of claim.evidence) {
    if (ev.note && ev.note.trim()) {
      const note = ev.note.length > 120 ? ev.note.slice(0, 120) : ev.note;
      return note;
    }
  }

  // Rule 2: reason_code present
  if (claim.reason_code) {
    const mc = manifest.claims.find((c) => c.id === claim.claim_id);
    const target = mc?.target;
    const location = target ? `${target.path}:${target.symbol ?? target.kind}` : claim.claim_id;
    return `${humanizeCode(claim.reason_code)} at ${location}`;
  }

  // Rule 3: fallback from target
  const mc = manifest.claims.find((c) => c.id === claim.claim_id);
  const target = mc?.target;
  if (target) {
    return `${target.kind} ${target.symbol ?? ""} in ${target.path}`.trim();
  }

  return `claim ${claim.claim_id}`;
}

// reviewer_focus reasons are now produced by the core's buildReviewerFocus
// using spec §5.1 templates — the human renderer uses them verbatim.

// ─── Main renderer ─────────────────────────────────────────────────────────

export function renderHuman(
  report: VerdictReport,
  manifest: Manifest,
  useColor: boolean,
): string {
  const lines: string[] = [];
  const { session, task } = manifest;

  // Header
  lines.push(
    `🤖 Agent: ${session.agent} (${session.model}) · ${session.tool_calls_count} tool calls · ${session.files_touched.length} files touched`,
  );
  lines.push(`📝 Task: ${task.summary}`);
  lines.push("");

  // Declared changes
  lines.push(`📋 Declared changes (${report.claims.length}):`);
  for (const claim of report.claims) {
    const icon = VERDICT_ICON[claim.verdict] ?? "?";
    const coloredIcon = colorize(icon, VERDICT_COLOR[claim.verdict] ?? "reset", useColor);
    const summary = evidenceSummary(claim, manifest);
    lines.push(`  ${coloredIcon} ${claim.claim_id}  ${summary}`);
  }

  // Undeclared modifications (omit if empty)
  if (report.undeclared.length > 0) {
    lines.push("");
    lines.push(`⚠️ Undeclared modifications (${report.undeclared.length}):`);
    for (const u of report.undeclared) {
      if (u.type === "symbol") {
        lines.push(`  • ${u.path} — symbol \`${u.symbol}\` modified but not in any claim`);
      } else {
        lines.push(`  • ${u.path} — file modified but not in any claim`);
      }
    }
  }

  // Reviewer focus (omit only when every claim verified AND no undeclared)
  const allVerified = report.claims.every((c) => c.verdict === "verified");
  const noUndeclared = report.undeclared.length === 0;
  if (!(allVerified && noUndeclared)) {
    lines.push("");
    lines.push("🔍 Reviewer focus:");
    let i = 1;
    for (const item of report.reviewer_focus) {
      lines.push(`  ${i}. ${item.reason}`);
      i++;
    }
  }

  return lines.join("\n") + "\n";
}
