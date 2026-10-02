import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5602);
const HOST = "0.0.0.0";

const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".mjs": "application/javascript; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=UTF-8",
};

const COMPRESSIBLE = new Set([
  "text/html; charset=UTF-8",
  "text/css; charset=UTF-8",
  "application/javascript; charset=UTF-8",
  "application/json; charset=UTF-8",
  "image/svg+xml",
  "application/xml",
  "text/plain; charset=UTF-8",
]);

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Connection", "keep-alive");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  let decodedUrl;
  try {
    decodedUrl = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request: Malformed URI");
    return;
  }

  // Prevent directory traversal & dotfiles (.git, .env, .gitignore)
  const segments = decodedUrl.split(/[/\\]+/).filter(Boolean);
  if (segments.some(seg => seg.startsWith("."))) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
    return;
  }

  let safePath = path.normalize(decodedUrl).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  if (!safePath || safePath === ".") safePath = "index.html";

  let filePath = path.resolve(__dirname, safePath);

  // Security check: must reside inside root directory
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }


  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) && safePath === "favicon.ico") {
    const fallbackFavicon = path.join(__dirname, "icons", "favicon.ico");
    if (fs.existsSync(fallbackFavicon)) filePath = fallbackFavicon;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const error404 = path.join(__dirname, "404.html");
    if (fs.existsSync(error404)) {
      res.writeHead(404, { "Content-Type": "text/html; charset=UTF-8" });
      res.end(fs.readFileSync(error404));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const stat = fs.statSync(filePath);

  const isStaticMedia = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".woff", ".woff2"].includes(ext);
  const cacheControl = isStaticMedia
    ? "public, max-age=86400, stale-while-revalidate=604800"
    : "no-cache, must-revalidate";

  const headers = {
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
  };

  const acceptEncoding = req.headers["accept-encoding"] || "";
  const shouldCompress = COMPRESSIBLE.has(contentType) && stat.size > 256;

  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    res.end();
    return;
  }

  if (shouldCompress && acceptEncoding.includes("gzip")) {
    headers["Content-Encoding"] = "gzip";
    headers["Vary"] = "Accept-Encoding";
    res.writeHead(200, headers);
    const raw = fs.createReadStream(filePath);
    const gzip = zlib.createGzip({ level: 6 });
    raw.on("error", () => res.end());
    gzip.on("error", () => res.end());
    raw.pipe(gzip).pipe(res);
  } else {
    headers["Content-Length"] = stat.size;
    res.writeHead(200, headers);
    const raw = fs.createReadStream(filePath);
    raw.on("error", () => res.end());
    raw.pipe(res);
  }

});

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
