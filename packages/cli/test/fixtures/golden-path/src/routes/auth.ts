import express from "express";

export function unlistedHelper(): void {
  // not in any claim
}

express().post("/login", (req, res) => {
  res.json({ ok: true });
});
