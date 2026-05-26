import express from "express";

const app = express();

app.post("/x", (req, res) => {
  res.json({ data: "unprotected" });
});
