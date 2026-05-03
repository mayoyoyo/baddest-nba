import { hashSessionToken, getRequestIp, toSessionUser } from "../lib/auth.js";
import { hashPin, verifyPin } from "../lib/pin.js";
import {
  clearRateLimit,
  createAuthAttemptKey,
  getRateLimitStatus,
  recordRateLimitFailure,
} from "../lib/rateLimit.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import type { DatabaseLike } from "../lib/db.js";
import {
  createSession,
  createUser,
  deleteSessionByTokenHash,
  getUserByUsername,
} from "../repositories/usersRepo.js";
import type { AppBindings, AuthViewer, SessionUser } from "../types.js";

export interface AuthPayload {
  username: string;
  pin: string;
  turnstileToken?: string;
}

export class AuthServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface AuthResult {
  sessionToken: string;
  user: SessionUser;
}

function normalizeUsername(rawUsername: string): string {
  return rawUsername.trim().toLowerCase();
}

function validateUsername(username: string): boolean {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

function validatePin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
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

async function ensureTurnstile(
  env: AppBindings,
  token: string | undefined,
  request: Request,
): Promise<void> {
  const ok = await verifyTurnstile(token, env, getRequestIp(request));
  if (!ok) {
    throw new AuthServiceError(400, "Turnstile verification failed");
  }
}

async function createAuthSession(
  db: DatabaseLike,
  userId: string,
  ipAddress: string | null,
): Promise<string> {
  const token = makeSessionToken();
  const tokenHash = await hashSessionToken(token);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await createSession(db, {
    id: crypto.randomUUID(),
    user_id: userId,
    token_hash: tokenHash,
    created_at: createdAt,
    expires_at: expiresAt,
    last_seen_at: createdAt,
    ip_hash: ipAddress,
  });

  return token;
}

function signupsAreOpen(env: AppBindings): boolean {
  return env.SIGNUPS_OPEN === "true";
}

export async function signup(
  db: DatabaseLike,
  env: AppBindings,
  payload: AuthPayload,
  request: Request,
): Promise<AuthResult> {
  if (!signupsAreOpen(env)) {
    throw new AuthServiceError(403, "Signups are temporarily closed");
  }

  const username = normalizeUsername(payload.username);
  if (!validateUsername(username)) {
    throw new AuthServiceError(400, "Username must be 3-24 letters, numbers, or underscores");
  }

  if (!validatePin(payload.pin)) {
    throw new AuthServiceError(400, "PIN must be exactly 4 digits");
  }

  await ensureTurnstile(env, payload.turnstileToken, request);

  const existingUser = await getUserByUsername(db, username);
  if (existingUser) {
    throw new AuthServiceError(409, "Username is already taken");
  }

  const user = {
    id: crypto.randomUUID(),
    username,
    pin_hash: await hashPin(payload.pin),
    role: "user" as const,
    created_at: nowIso(),
    last_active_at: nowIso(),
    failed_login_count: 0,
    locked_until: null,
  };

  await createUser(db, user);
  const sessionToken = await createAuthSession(db, user.id, getRequestIp(request));

  return {
    sessionToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
  };
}

export async function login(
  db: DatabaseLike,
  env: AppBindings,
  payload: AuthPayload,
  request: Request,
): Promise<AuthResult> {
  const username = normalizeUsername(payload.username);
  if (!validateUsername(username) || !validatePin(payload.pin)) {
    throw new AuthServiceError(400, "Invalid username or PIN format");
  }

  await ensureTurnstile(env, payload.turnstileToken, request);

  const rateLimitKey = await createAuthAttemptKey(
    "login",
    username,
    getRequestIp(request),
  );
  const rateLimit = await getRateLimitStatus(db, rateLimitKey);
  if (rateLimit.blocked) {
    throw new AuthServiceError(429, "Too many failed login attempts");
  }

  const user = await getUserByUsername(db, username);
  const validPin = user ? await verifyPin(payload.pin, user.pin_hash) : false;
  if (!user || !validPin) {
    const failure = await recordRateLimitFailure(db, rateLimitKey);
    if (failure.blocked) {
      throw new AuthServiceError(429, "Too many failed login attempts");
    }

    throw new AuthServiceError(401, "Invalid username or PIN");
  }

  await clearRateLimit(db, rateLimitKey);
  const sessionToken = await createAuthSession(db, user.id, getRequestIp(request));

  return {
    sessionToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
  };
}

export async function logout(
  db: DatabaseLike,
  viewer: AuthViewer | null,
  sessionToken: string | null,
): Promise<void> {
  if (!viewer && !sessionToken) {
    return;
  }

  if (sessionToken) {
    await deleteSessionByTokenHash(db, await hashSessionToken(sessionToken));
  }
}

export function viewerResponse(viewer: AuthViewer): { user: SessionUser } {
  return {
    user: toSessionUser(viewer),
  };
}
