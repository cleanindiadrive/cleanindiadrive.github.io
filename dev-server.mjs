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

  const rawUrl = (req.url || "/").split("?")[0];
  let safePath = path.normalize(decodeURIComponent(rawUrl)).replace(/^(\.\.[/\\])+/, "");
  if (safePath === "/" || safePath === "\\" || !safePath) safePath = "index.html";

  let filePath = path.join(__dirname, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) && safePath === "favicon.ico") {
    const fallbackFavicon = path.join(__dirname, "icons", "favicon.ico");
    if (fs.existsSync(fallbackFavicon)) filePath = fallbackFavicon;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
    raw.pipe(gzip).pipe(res);
  } else {
    headers["Content-Length"] = stat.size;
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
