import { Hono } from "hono";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import imageRoutes from "./routes/images.js";
import leaderboardRoutes from "./routes/leaderboards.js";
import voteRoutes from "./routes/vote.js";
import type { AppEnv } from "./types.js";

const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api", adminRoutes);
app.route("/api", authRoutes);
app.route("/api", imageRoutes);
app.route("/api", leaderboardRoutes);
app.route("/api", voteRoutes);

export default app;
