/**
 * Servidor estático do painel admin — sobe em milissegundos, /health para proxy, SIGTERM gracioso.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const distRoot = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const port = Number(process.env.PORT ?? 3000);
const host = String(process.env.HOST ?? "0.0.0.0").trim() || "0.0.0.0";

const mimeByExt = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

const resolveSafeFile = (pathname) => {
  const pathOnly = String(pathname ?? "/").split("?")[0] || "/";
  const rel = pathOnly.replace(/^\/+/, "") || "index.html";
  if (rel.split("/").some((part) => part === "..")) return null;
  const candidate = resolve(join(distRoot, rel));
  if (!candidate.startsWith(distRoot)) return null;
  return candidate;
};

const sendFile = (req, res, filePath, cacheImmutable = false) => {
  const stat = statSync(filePath);
  const ext = extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader("content-type", mimeByExt[ext] ?? "application/octet-stream");
  res.setHeader("content-length", String(stat.size));
  if (cacheImmutable) {
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
  }
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(readFileSync(filePath));
};

const indexPath = resolve(join(distRoot, "index.html"));

const server = createServer((req, res) => {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    res.statusCode = 405;
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/health" || url.pathname === "/ready") {
    if (!existsSync(indexPath)) {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, reason: "dist_missing" }));
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, service: "admin" }));
    return;
  }

  const filePath = resolveSafeFile(url.pathname);
  if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(req, res, filePath, url.pathname.startsWith("/assets/"));
    return;
  }

  if (existsSync(indexPath)) {
    res.setHeader("cache-control", "no-cache");
    sendFile(req, res, indexPath, false);
    return;
  }

  res.statusCode = 503;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("Painel indisponível: build ausente (dist/index.html).");
});

const shutdown = (signal) => {
  console.log(`[admin-serve] ${signal} — encerrando…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(port, host, () => {
  console.log(`[admin-serve] listening http://${host}:${port} health=/health`);
});
