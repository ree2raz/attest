import { spawnSync } from "node:child_process";
import type { CommandResult } from "./types.js";

/**
 * Run a single shell command, capturing exit code, head/tail-truncated combined
 * output, and wall-clock duration (SPEC §6.4). Synchronous under the hood for
 * deterministic sequencing; exposed through an async orchestrator.
 */
export function runCommand(
  cmd: string,
  cwd: string,
  timeoutMs: number,
  logLimitBytes: number,
): CommandResult {
  const start = Date.now();
  const res = spawnSync("sh", ["-c", cmd], {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Date.now() - start;

  const combined = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const log = truncate(combined, logLimitBytes);

  // A timeout/kill leaves status null with a signal — treat as non-zero (124, the
  // conventional `timeout` exit code) so the outcome fails rather than silently passing.
  const exitCode = res.status ?? (res.signal ? 124 : 1);

  return { cmd, exitCode, log, durationMs };
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const half = Math.floor(limit / 2);
  const dropped = text.length - 2 * half;
  return `${text.slice(0, half)}\n...[${dropped} bytes truncated]...\n${text.slice(text.length - half)}`;
}
