export async function verifyTurnstile(token, env, remoteIp) {
    if (env.TURNSTILE_BYPASS === "true") {
        return true;
    }
    if (!token || !env.TURNSTILE_SECRET_KEY) {
        return false;
    }
    const body = new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
    });
    if (remoteIp) {
        body.set("remoteip", remoteIp);
    }
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body,
    });
    if (!response.ok) {
        return false;
    }
    const payload = (await response.json());
    return payload.success === true;
}
