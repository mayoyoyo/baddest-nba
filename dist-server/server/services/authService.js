import { hashSessionToken, getRequestIp, toSessionUser } from "../lib/auth.js";
import { hashPin, verifyPin } from "../lib/pin.js";
import { clearRateLimit, createAuthAttemptKey, getRateLimitStatus, recordRateLimitFailure, } from "../lib/rateLimit.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { createSession, createUser, deleteSessionByTokenHash, getUserByUsername, } from "../repositories/usersRepo.js";
export class AuthServiceError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function normalizeUsername(rawUsername) {
    return rawUsername.trim().toLowerCase();
}
function validateUsername(username) {
    return /^[a-z0-9_]{3,24}$/.test(username);
}
function validatePin(pin) {
    return /^\d{4}$/.test(pin);
}
function makeSessionToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function nowIso() {
    return new Date().toISOString();
}
async function ensureTurnstile(env, token, request) {
    const ok = await verifyTurnstile(token, env, getRequestIp(request));
    if (!ok) {
        throw new AuthServiceError(400, "Turnstile verification failed");
    }
}
async function createAuthSession(db, userId, ipAddress) {
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
function signupsAreOpen(env) {
    return env.SIGNUPS_OPEN === "true";
}
export async function signup(db, env, payload, request) {
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
        role: "user",
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
export async function login(db, env, payload, request) {
    const username = normalizeUsername(payload.username);
    if (!validateUsername(username) || !validatePin(payload.pin)) {
        throw new AuthServiceError(400, "Invalid username or PIN format");
    }
    await ensureTurnstile(env, payload.turnstileToken, request);
    const rateLimitKey = await createAuthAttemptKey("login", username, getRequestIp(request));
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
export async function logout(db, viewer, sessionToken) {
    if (!viewer && !sessionToken) {
        return;
    }
    if (sessionToken) {
        await deleteSessionByTokenHash(db, await hashSessionToken(sessionToken));
    }
}
export function viewerResponse(viewer) {
    return {
        user: toSessionUser(viewer),
    };
}
