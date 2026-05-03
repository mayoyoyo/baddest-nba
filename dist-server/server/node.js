import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import app from "./app.js";
const moduleDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(moduleDir, "../../dist");
app.use("/assets/*", serveStatic({
    root: distDir,
    rewriteRequestPath: (path) => path,
}));
app.use("/favicon.ico", serveStatic({ root: distDir, rewriteRequestPath: () => "/favicon.ico" }));
let cachedIndexHtml = null;
async function getIndexHtml() {
    cachedIndexHtml ??= await readFile(resolve(distDir, "index.html"), "utf-8");
    return cachedIndexHtml;
}
app.get("*", async (c) => {
    if (c.req.path.startsWith("/api/")) {
        return c.notFound();
    }
    const html = await getIndexHtml();
    return c.html(html);
});
const port = Number.parseInt(process.env.PORT ?? "8080", 10);
serve({ fetch: app.fetch, port }, (info) => {
    console.log(`baddest-nba listening on http://localhost:${info.port}`);
});
