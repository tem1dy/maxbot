import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const staticDir = join(root, "dist");
const port = Number(process.env.PORT || 8080);

function contentType(file) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
  }[extname(file)] || "application/octet-stream";
}

const server = createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8", Allow: "GET, HEAD" });
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }
  if (req.url?.startsWith("/api/")) {
    res.writeHead(410, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ error: "api_is_served_by_fastapi" }));
  }
  const requested = decodeURIComponent((req.url || "/").split("?")[0]);
  const safe = requested.replaceAll("..", "");
  let file = join(staticDir, safe === "/" ? "index.html" : safe.replace(/^\//, ""));
  if (!existsSync(file) || !extname(file)) file = join(staticDir, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
  const headers = { "Content-Type": contentType(file) };
  if (file.endsWith("index.html")) headers["Cache-Control"] = "no-store";
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  res.end(readFileSync(file));
});
server.listen(port, "0.0.0.0", () => console.log(`Поле рядом frontend: http://0.0.0.0:${port}`));
