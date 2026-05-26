import type { VerdictReport } from "@attest/core";

export function renderJson(report: VerdictReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}
