import express from "express";

const app = express();

app.get("/existing", (req, res) => {
  res.json({ ok: true });
});
