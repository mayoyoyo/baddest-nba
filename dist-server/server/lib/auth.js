import { getSessionToken } from "./cookies.js";
import { getDb } from "./runtime.js";
import { deleteSessionByTokenHash, getSessionByTokenHash, getUserById, } from "../repositories/usersRepo.js";
async function sha256Hex(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function hashSessionToken(token) {
    return sha256Hex(token);
}
export function getRequestIp(request) {
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
export function toSessionUser(viewer) {
    return {
        id: viewer.user.id,
        username: viewer.user.username,
        role: viewer.user.role,
    };
}
export async function getViewer(c) {
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
export const requireAuth = async (c, next) => {
    const viewer = await getViewer(c);
    if (!viewer) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("viewer", viewer);
    await next();
};
export const requireAdmin = async (c, next) => {
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
