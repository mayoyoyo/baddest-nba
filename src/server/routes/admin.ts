import { Hono } from "hono";
import { requireAdmin } from "../lib/auth.js";
import { getAppBindings, getDb } from "../lib/runtime.js";
import {
  deleteImage,
  searchImagesById,
  uploadImage,
} from "../services/uploadService.js";
import type { AppEnv } from "../types.js";

const adminRoutes = new Hono<AppEnv>();

adminRoutes.get("/admin/images/upload", requireAdmin, async (c) => {
  const viewer = c.get("viewer");
  if (!viewer) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (c.req.query("action") !== "search") {
    return c.notFound();
  }

  return c.json({
    images: await searchImagesById(getDb(c), c.req.query("query") ?? ""),
  });
});

adminRoutes.post("/admin/images/upload", requireAdmin, async (c) => {
  const viewer = c.get("viewer");
  if (!viewer) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const formData = await c.req.formData().catch(() => null);
  if (!formData) {
    return c.json({ error: "Invalid upload form" }, 400);
  }

  const original = formData.get("original");
  const display = formData.get("display");
  const replaceImageId = String(formData.get("replaceImageId") ?? "").trim();
  const sourceName = String(formData.get("sourceName") ?? "").trim();
  const width = Number.parseInt(String(formData.get("width") ?? ""), 10);
  const height = Number.parseInt(String(formData.get("height") ?? ""), 10);

  if (!(display instanceof File)) {
    return c.json({ error: "Display file is required" }, 400);
  }

  if (original !== null && !(original instanceof File)) {
    return c.json({ error: "Original file must be an image file" }, 400);
  }

  try {
    const result = await uploadImage(getDb(c), getAppBindings(c), {
      original: original instanceof File ? original : undefined,
      display,
      width,
      height,
      replaceImageId: replaceImageId || undefined,
      sourceName: sourceName || undefined,
      uploadedBy: viewer.user.id,
    });
    return c.json(result, result.replaced ? 200 : 201);
  } catch (error) {
    c.status(400);
    return c.json({
      error: error instanceof Error ? error.message : "Upload failed",
    });
  }
});

adminRoutes.delete("/admin/images/upload", requireAdmin, async (c) => {
  const viewer = c.get("viewer");
  if (!viewer) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const imageId = c.req.query("imageId")?.trim() ?? "";
  if (!imageId) {
    return c.json({ error: "Image id is required" }, 400);
  }

  try {
    await deleteImage(getDb(c), getAppBindings(c), imageId);
    return c.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Delete failed";
    return c.json(
      { error: message },
      message.includes("does not exist") ? 404 : 400,
    );
  }
});

export default adminRoutes;
