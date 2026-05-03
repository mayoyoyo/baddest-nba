import type { Context, MiddlewareHandler } from "hono";
import {
  createSessionCookie,
  getSessionToken,
  shouldUseSecureCookies,
} from "./cookies.js";
import { getDb } from "./runtime.js";
import {
  createSession,
  createUser,
  deleteSessionByTokenHash,
  getSessionByTokenHash,
  getUserById,
  type UserRow,
} from "../repositories/usersRepo.js";
import type { AppEnv, AuthViewer, SessionUser } from "../types.js";

const GUEST_PIN_HASH_SENTINEL = "guest:no-login";
const SESSION_TTL_DAYS = 30;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function hashSessionToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export function getRequestIp(request: Request): string | null {
  const flyClientIp = request.headers.get("fly-client-ip");
  if (flyClientIp) {
    return flyClientIp;
  }

  const cloudflareIp = request.headers.get("cf-connecting-ip");
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) {
    return null;
  }

  const [firstIp] = forwardedFor.split(",").map((value) => value.trim());
  return firstIp || null;
}

export function toSessionUser(viewer: AuthViewer): SessionUser {
  return {
    id: viewer.user.id,
    username: viewer.user.username,
    role: viewer.user.role,
  };
}

function makeSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeGuestUsername(): string {
  return `guest-${crypto.randomUUID().slice(0, 8)}`;
}

export async function getViewer(
  c: Context<AppEnv>,
): Promise<AuthViewer | null> {
  const cachedViewer = c.get("viewer");
  if (cachedViewer) {
    return cachedViewer;
  }

  const token = getSessionToken(c.req.raw);
  if (!token) {
    return null;
  }

  const tokenHash = await hashSessionToken(token);
  const db = getDb(c);
  const session = await getSessionByTokenHash(db, tokenHash);
  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await deleteSessionByTokenHash(db, tokenHash);
    return null;
  }

  const user = await getUserById(db, session.user_id);
  if (!user) {
    return null;
  }

  const viewer = { session, user };
  c.set("viewer", viewer);
  return viewer;
}

async function createGuestSession(
  c: Context<AppEnv>,
): Promise<AuthViewer> {
  const db = getDb(c);
  const ip = getRequestIp(c.req.raw);
  const created = nowIso();
  const userRow: UserRow = {
    id: crypto.randomUUID(),
    username: makeGuestUsername(),
    pin_hash: GUEST_PIN_HASH_SENTINEL,
    role: "guest",
    created_at: created,
    last_active_at: created,
    failed_login_count: 0,
    locked_until: null,
  };

  await createUser(db, userRow);

  const token = makeSessionToken();
  const tokenHash = await hashSessionToken(token);
  const sessionRow = {
    id: crypto.randomUUID(),
    user_id: userRow.id,
    token_hash: tokenHash,
    created_at: created,
    expires_at: new Date(
      Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString(),
    last_seen_at: created,
    ip_hash: ip,
  };
  await createSession(db, sessionRow);

  c.header(
    "set-cookie",
    createSessionCookie(token, shouldUseSecureCookies(c.req.raw)),
  );

  return { session: sessionRow, user: userRow };
}

// Returns the current viewer, lazily creating a guest user + session if
// none exists. Used on routes where we want voting/leaderboards to "just
// work" the moment someone shows up.
export const ensureViewer: MiddlewareHandler<AppEnv> = async (c, next) => {
  let viewer = await getViewer(c);
  if (!viewer) {
    viewer = await createGuestSession(c);
  }
  c.set("viewer", viewer);
  await next();
};

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const viewer = await getViewer(c);
  if (!viewer) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("viewer", viewer);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const viewer = await getViewer(c);
  if (!viewer) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (viewer.user.role !== "admin") {
    c.status(403);
    return c.json({ error: "Forbidden" });
  }

  c.set("viewer", viewer);
  await next();
};

// True for users we want excluded from the shared leaderboard
// aggregation: anonymous guest sessions and seed/system accounts.
export function isPublicVoter(role: string): boolean {
  return role === "user" || role === "admin";
}
