import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extname, join, relative, resolve, sep } from "node:path";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const clientRoot = resolve(join(appRoot, "dist/client"));

const { default: serverEntry } = await import(pathToFileURL(join(appRoot, "dist/server/server.js")).href);

const port = Number(process.env.PORT ?? "3000");
const host = process.env.HOST ?? "0.0.0.0";

const mimeByExt = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

const PUBLIC_ROOT_FILES = new Set(["/drax-logo-footer.png", "/favicon.ico", "/robots.txt"]);

const isSafeClientPath = (pathname) => {
  const pathOnly = pathname.split("?")[0];
  const isAsset = pathOnly.startsWith("/assets/");
  const isPublicRoot = PUBLIC_ROOT_FILES.has(pathOnly);
  if (!isAsset && !isPublicRoot) return null;
  const rel = pathOnly.replace(/^\//, "");
  if (!rel || rel.split("/").some((p) => p === "..")) return null;
  const candidate = resolve(join(clientRoot, rel));
  const relToClient = relative(clientRoot, candidate);
  if (relToClient.startsWith("..") || relToClient.includes(`${sep}..${sep}`)) return null;
  return candidate;
};

const tryServeClientStatic = (req, res, pathname) => {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const candidate = isSafeClientPath(pathname);
  if (!candidate || !existsSync(candidate) || !statSync(candidate).isFile()) return false;

  const ext = extname(candidate).toLowerCase();
  const mime = mimeByExt[ext] ?? "application/octet-stream";
  const size = statSync(candidate).size;

  res.statusCode = 200;
  res.setHeader("content-type", mime);
  res.setHeader("cache-control", "public, max-age=31536000, immutable");
  res.setHeader("content-length", String(size));

  if (req.method === "HEAD") {
    res.end();
    return true;
  }

  res.end(readFileSync(candidate));
  return true;
};

const toRequestBody = (req) => {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  return Readable.toWeb(req);
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (tryServeClientStatic(req, res, url.pathname)) {
      return;
    }

    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: toRequestBody(req),
      duplex: "half",
    });
    const response = await serverEntry.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    if (!response.body) {
      res.end();
      return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    console.error("[serve-production] request failed", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Erro interno ao carregar a pagina de vendas.");
  }
});

server.listen(port, host, () => {
  console.log(`[serve-production] listening on http://${host}:${port}`);
});
