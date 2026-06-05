import type { Verdict } from "@attest/schema";

export function renderJson(verdict: Verdict): string {
  return JSON.stringify(verdict, null, 2) + "\n";
}
