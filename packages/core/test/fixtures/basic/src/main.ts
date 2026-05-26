import express from "express";

export function foo(x: number): number {
  return x + 1;
}

export function unlistedHelper(): void {
  // present in diff but not in any claim — should be flagged undeclared
}

const app = express();
app.post("/login", (_req, res) => {
  res.json({ ok: true });
});
