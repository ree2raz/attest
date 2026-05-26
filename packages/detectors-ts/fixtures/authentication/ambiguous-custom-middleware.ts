import express from "express";

const app = express();

function customThing(req: any, res: any, next: any) {
  // opaque logic — no clear auth signal
  const x = req.body;
  next();
}

app.post("/x", customThing, (req, res) => {
  res.json({ ok: true });
});
