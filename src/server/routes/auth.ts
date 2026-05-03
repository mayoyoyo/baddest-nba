import { Hono, type Context } from "hono";
import {
  clearSessionCookie,
  createSessionCookie,
  getSessionToken,
  shouldUseSecureCookies,
} from "../lib/cookies.js";
import { ensureViewer, getViewer, requireAuth } from "../lib/auth.js";
import { getAppBindings, getDb } from "../lib/runtime.js";
import {
  getTopRatedImageIdForUser,
  getUserState,
} from "../repositories/leaderboardsRepo.js";
import { listPlayersByImageIds } from "../repositories/playersRepo.js";
import {
  AuthServiceError,
  login,
  logout,
  promoteGuest,
  signup,
} from "../services/authService.js";
import type { AppEnv, AuthViewer } from "../types.js";

const AVATAR_VOTE_THRESHOLD = 10;

const authRoutes = new Hono<AppEnv>();
type AppContext = Context<AppEnv>;

async function parseAuthPayload(request: Request): Promise<{
  username: string;
  pin: string;
  turnstileToken?: string;
}> {
  const payload = (await request.json().catch(() => null)) as
    | {
        username?: unknown;
        pin?: unknown;
        turnstileToken?: unknown;
      }
    | null;

  if (
    !payload ||
    typeof payload.username !== "string" ||
    typeof payload.pin !== "string"
  ) {
    throw new AuthServiceError(400, "Invalid request body");
  }

  return {
    username: payload.username,
    pin: payload.pin,
    turnstileToken:
      typeof payload.turnstileToken === "string"
        ? payload.turnstileToken
        : undefined,
  };
}

async function buildMePayload(c: AppContext, viewer: AuthViewer | null) {
  if (!viewer) {
    return {
      user: null,
      totalVotesCast: 0,
      avatarImageId: null as string | null,
      avatarTeam: null as string | null,
    };
  }

  const db = getDb(c);
  const userState = await getUserState(db, viewer.user.id);
  const totalVotesCast = userState?.total_votes_cast ?? 0;
  const avatarImageId =
    totalVotesCast >= AVATAR_VOTE_THRESHOLD
      ? await getTopRatedImageIdForUser(db, viewer.user.id)
      : null;
  let avatarTeam: string | null = null;
  if (avatarImageId) {
    const players = await listPlayersByImageIds(db, [avatarImageId]);
    avatarTeam = players[0]?.team ?? null;
  }

  return {
    user: {
      id: viewer.user.id,
      username: viewer.user.username,
      role: viewer.user.role,
    },
    totalVotesCast,
    avatarImageId,
    avatarTeam,
  };
}

async function handleSignup(c: AppContext) {
  try {
    const result = await signup(
      getDb(c),
      getAppBindings(c),
      await parseAuthPayload(c.req.raw),
      c.req.raw,
    );
    c.header(
      "set-cookie",
      createSessionCookie(result.sessionToken, shouldUseSecureCookies(c.req.raw)),
    );
    return c.json({ user: result.user }, 201);
  } catch (error) {
    if (error instanceof AuthServiceError) {
      c.status(error.status as 400 | 401 | 403 | 409 | 429);
      return c.json({ error: error.message });
    }
    throw error;
  }
}

async function handleLogin(c: AppContext) {
  try {
    const result = await login(
      getDb(c),
      getAppBindings(c),
      await parseAuthPayload(c.req.raw),
      c.req.raw,
    );
    c.header(
      "set-cookie",
      createSessionCookie(result.sessionToken, shouldUseSecureCookies(c.req.raw)),
    );
    return c.json({ user: result.user });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      c.status(error.status as 400 | 401 | 409 | 429);
      return c.json({ error: error.message });
    }
    throw error;
  }
}

async function handleLogout(c: AppContext) {
  const viewer = await getViewer(c);
  await logout(getDb(c), viewer, getSessionToken(c.req.raw));
  c.header(
    "set-cookie",
    clearSessionCookie(shouldUseSecureCookies(c.req.raw)),
  );
  return c.json({ ok: true });
}

async function handleMe(c: AppContext) {
  // No auth gate: anonymous visitors get a null user, guests and real
  // users get the live viewer payload.
  const viewer = await getViewer(c);
  return c.json(await buildMePayload(c, viewer));
}

async function handlePromote(c: AppContext) {
  const viewer = c.get("viewer");
  if (!viewer) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const result = await promoteGuest(
      getDb(c),
      getAppBindings(c),
      viewer,
      await parseAuthPayload(c.req.raw),
      c.req.raw,
    );
    return c.json({ user: result.user });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      c.status(error.status as 400 | 401 | 403 | 409 | 429);
      return c.json({ error: error.message });
    }
    throw error;
  }
}

authRoutes.post("/signup", handleSignup);
authRoutes.post("/login", handleLogin);
authRoutes.post("/logout", handleLogout);

// /me is unauthenticated by design — see buildMePayload.
authRoutes.get("/me", handleMe);

authRoutes.post("/me/promote", requireAuth, handlePromote);

authRoutes.on(["GET", "POST"], "/auth", async (c) => {
  const action = c.req.query("action")?.trim();

  if (action === "signup" && c.req.method === "POST") {
    return handleSignup(c);
  }

  if (action === "login" && c.req.method === "POST") {
    return handleLogin(c);
  }

  if (action === "logout" && c.req.method === "POST") {
    return handleLogout(c);
  }

  if (action === "me" && c.req.method === "GET") {
    return handleMe(c);
  }

  return c.json({ error: "Not found" }, 404);
});

// Re-exported so route files can mount the same middleware without an
// extra import in every file.
export { ensureViewer };

export default authRoutes;
