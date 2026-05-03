import { Hono } from "hono";
import { requireAuth } from "../lib/auth.js";
import { getDb } from "../lib/runtime.js";
import type { AppEnv } from "../types.js";
import {
  getPeople,
  getSharedLeaderboard,
  getUserLeaderboard,
} from "../services/leaderboardService.js";

const leaderboardRoutes = new Hono<AppEnv>();

leaderboardRoutes.get("/leaderboard/shared", requireAuth, async (c) => {
  return c.json(await getSharedLeaderboard(getDb(c)));
});

leaderboardRoutes.get("/shared-leaderboard", requireAuth, async (c) => {
  return c.json(await getSharedLeaderboard(getDb(c)));
});

leaderboardRoutes.get("/people", requireAuth, async (c) => {
  return c.json(await getPeople(getDb(c)));
});

leaderboardRoutes.get("/me/leaderboard", requireAuth, async (c) => {
  const viewer = c.get("viewer");
  if (!viewer) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json(await getUserLeaderboard(getDb(c), viewer.user.username));
});

leaderboardRoutes.get("/user-leaderboard", requireAuth, async (c) => {
  const username = c.req.query("username")?.trim() ?? "";
  if (!username) {
    return c.json({ error: "Username is required" }, 400);
  }

  const result = await getUserLeaderboard(getDb(c), username);
  if (!result) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(result);
});

leaderboardRoutes.get("/users/:username/leaderboard", requireAuth, async (c) => {
  const result = await getUserLeaderboard(getDb(c), c.req.param("username"));
  if (!result) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(result);
});

export default leaderboardRoutes;
