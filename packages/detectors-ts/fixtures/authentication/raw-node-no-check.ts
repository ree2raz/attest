import http from "http";

http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/x") {
    res.writeHead(200);
    res.end(JSON.stringify({ data: "unprotected" }));
  }
});
