import express from "express";

const app = express();

function authMiddleware(req: any, res: any, next: any) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.use(authMiddleware);

app.post("/x", (req, res) => {
  res.json({ ok: true });
});
