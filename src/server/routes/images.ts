import { Hono } from "hono";
import { requireAuth } from "../lib/auth.js";
import { getAppBindings, getDb } from "../lib/runtime.js";
import { getDisplayImage } from "../services/uploadService.js";
import type { AppEnv } from "../types.js";

const imageRoutes = new Hono<AppEnv>();

imageRoutes.get("/image", requireAuth, async (c) => {
  const imageId = c.req.query("imageId")?.trim() ?? "";
  if (!imageId) {
    return c.json({ error: "imageId is required" }, 400);
  }

  const result = await getDisplayImage(
    getDb(c),
    getAppBindings(c),
    imageId,
  );
  if (!result) {
    return c.json({ error: "Not found" }, 404);
  }

  const headers = new Headers();
  if (result.object.contentType) {
    headers.set("content-type", result.object.contentType);
  }
  if (!headers.get("content-type")) {
    headers.set("content-type", result.image?.mime_type ?? "application/octet-stream");
  }
  headers.set("cache-control", "private, max-age=60");

  return new Response(result.object.body, {
    status: 200,
    headers,
  });
});

imageRoutes.get("/images/:imageId", requireAuth, async (c) => {
  const result = await getDisplayImage(
    getDb(c),
    getAppBindings(c),
    c.req.param("imageId"),
  );
  if (!result) {
    return c.json({ error: "Not found" }, 404);
  }

  const headers = new Headers();
  if (result.object.contentType) {
    headers.set("content-type", result.object.contentType);
  }
  if (!headers.get("content-type")) {
    headers.set("content-type", result.image?.mime_type ?? "application/octet-stream");
  }
  headers.set("cache-control", "private, max-age=60");

  return new Response(result.object.body, {
    status: 200,
    headers,
  });
});

export default imageRoutes;
