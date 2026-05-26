import http from "http";

http.createServer((req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  if (req.method === "POST" && req.url === "/x") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
  }
});
