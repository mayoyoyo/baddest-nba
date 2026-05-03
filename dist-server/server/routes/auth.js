import { Hono } from "hono";
import { getSessionToken, createSessionCookie, clearSessionCookie, shouldUseSecureCookies } from "../lib/cookies.js";
import { getViewer, requireAuth } from "../lib/auth.js";
import { getAppBindings, getDb } from "../lib/runtime.js";
import { AuthServiceError, login, logout, signup, viewerResponse, } from "../services/authService.js";
const authRoutes = new Hono();
async function parseAuthPayload(request) {
    const payload = (await request.json().catch(() => null));
    if (!payload || typeof payload.username !== "string" || typeof payload.pin !== "string") {
        throw new AuthServiceError(400, "Invalid request body");
    }
    return {
        username: payload.username,
        pin: payload.pin,
        turnstileToken: typeof payload.turnstileToken === "string" ? payload.turnstileToken : undefined,
    };
}
async function handleSignup(c) {
    try {
        const result = await signup(getDb(c), getAppBindings(c), await parseAuthPayload(c.req.raw), c.req.raw);
        c.header("set-cookie", createSessionCookie(result.sessionToken, shouldUseSecureCookies(c.req.raw)));
        return c.json({ user: result.user }, 201);
    }
    catch (error) {
        if (error instanceof AuthServiceError) {
            c.status(error.status);
            return c.json({ error: error.message });
        }
        throw error;
    }
}
async function handleLogin(c) {
    try {
        const result = await login(getDb(c), getAppBindings(c), await parseAuthPayload(c.req.raw), c.req.raw);
        c.header("set-cookie", createSessionCookie(result.sessionToken, shouldUseSecureCookies(c.req.raw)));
        return c.json({ user: result.user });
    }
    catch (error) {
        if (error instanceof AuthServiceError) {
            c.status(error.status);
            return c.json({ error: error.message });
        }
        throw error;
    }
}
async function handleLogout(c) {
    const viewer = await getViewer(c);
    await logout(getDb(c), viewer, getSessionToken(c.req.raw));
    c.header("set-cookie", clearSessionCookie(shouldUseSecureCookies(c.req.raw)));
    return c.json({ ok: true });
}
async function handleMe(c) {
    const viewer = await getViewer(c);
    if (!viewer) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    return c.json(viewerResponse(viewer));
}
authRoutes.post("/signup", async (c) => handleSignup(c));
authRoutes.post("/login", async (c) => handleLogin(c));
authRoutes.post("/logout", async (c) => handleLogout(c));
authRoutes.get("/me", requireAuth, async (c) => {
    const viewer = c.get("viewer");
    if (!viewer) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    return c.json(viewerResponse(viewer));
});
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
export default authRoutes;
