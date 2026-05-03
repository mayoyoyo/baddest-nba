import { Hono } from "hono";
import { ensureViewer, requireAuth } from "../lib/auth.js";
import { getDb } from "../lib/runtime.js";
import type { AppEnv } from "../types.js";
import {
  getPeople,
  getSharedLeaderboard,
  getUserLeaderboard,
} from "../services/leaderboardService.js";

const leaderboardRoutes = new Hono<AppEnv>();

// Shared leaderboard is public — anonymous visitors see it. Guest votes
// are filtered out of the aggregation in the service so spam from
// drive-by users can't move the global ranking.
leaderboardRoutes.get("/leaderboard/shared", async (c) => {
  return c.json(await getSharedLeaderboard(getDb(c)));
});

leaderboardRoutes.get("/shared-leaderboard", async (c) => {
  return c.json(await getSharedLeaderboard(getDb(c)));
});

leaderboardRoutes.get("/people", requireAuth, async (c) => {
  return c.json(await getPeople(getDb(c)));
});

leaderboardRoutes.get("/me/leaderboard", ensureViewer, async (c) => {
  const viewer = c.get("viewer");
  if (!viewer) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json(await getUserLeaderboard(getDb(c), viewer.user.username));
});

leaderboardRoutes.get("/user-leaderboard", async (c) => {
  const username = c.req.query("username")?.trim() ?? "";
  if (!username) {
    return c.json({ error: "Username is required" }, 400);
  }

  const result = await getUserLeaderboard(getDb(c), username);
  if (!result || result.user.role === "guest") {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(result);
});

leaderboardRoutes.get("/users/:username/leaderboard", async (c) => {
  const result = await getUserLeaderboard(getDb(c), c.req.param("username"));
  if (!result || result.user.role === "guest") {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(result);
});

export default leaderboardRoutes;
