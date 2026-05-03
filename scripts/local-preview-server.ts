import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import app from "../src/server/app";

const host = "127.0.0.1";
const port = 8788;
const distDir = path.resolve(process.cwd(), "dist");

const contentTypes = new Map<string, string>([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".ico", "image/x-icon"],
]);

function getContentType(filePath: string): string {
  return contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

function buildRequest(req: http.IncomingMessage): Request {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
      continue;
    }

    if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const hasBody = req.method && !["GET", "HEAD"].includes(req.method);

  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

function writeResponse(res: http.ServerResponse, response: Response): void {
  res.statusCode = response.status;

  const getSetCookie = (
    response.headers as Headers & {
      getSetCookie?: () => string[];
    }
  ).getSetCookie?.();
  if (getSetCookie && getSetCookie.length > 0) {
    res.setHeader("set-cookie", getSetCookie);
  }

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      return;
    }

    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  Readable.fromWeb(response.body).pipe(res);
}

async function tryServeStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);
  const normalizedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(distDir, `.${normalizedPath}`);

  if (!filePath.startsWith(distDir)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return true;
  }

  if (!existsSync(filePath)) {
    return false;
  }

  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) {
    return false;
  }

  res.statusCode = 200;
  res.setHeader("content-type", getContentType(filePath));
  createReadStream(filePath).pipe(res);
  return true;
}

async function serveIndex(res: http.ServerResponse): Promise<void> {
  const indexPath = path.join(distDir, "index.html");
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  createReadStream(indexPath).pipe(res);
}

async function main(): Promise<void> {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? `${host}:${port}`}`,
      ).pathname;

      if (pathname.startsWith("/api/")) {
        const response = await app.fetch(buildRequest(req), {});
        writeResponse(res, response);
        return;
      }

      if (await tryServeStatic(req, res)) {
        return;
      }

      await serveIndex(res);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(error instanceof Error ? error.stack ?? error.message : "Unknown error");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  console.log(`Local preview running at http://${host}:${port}`);
}

await main();
