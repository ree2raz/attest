import express from "express";

const app = express();

function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.post("/x", authMiddleware, (req, res) => {
  res.json({ ok: true });
});
