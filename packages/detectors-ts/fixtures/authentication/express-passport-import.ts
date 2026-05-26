import express from "express";
import passport from "passport";

const app = express();

app.post("/x", passport.authenticate("jwt", { session: false }), (req, res) => {
  res.json({ ok: true });
});
