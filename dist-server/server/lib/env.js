function readRequired(source, key) {
    const value = source[key]?.trim();
    if (!value) {
        throw new Error(`${key} is required`);
    }
    return value;
}
export function readServerEnv(source) {
    return {
        databaseUrl: readRequired(source, "DATABASE_URL"),
        signupsOpen: source.SIGNUPS_OPEN !== "false",
        turnstileBypass: source.TURNSTILE_BYPASS === "true",
        turnstileSiteKey: source.TURNSTILE_SITE_KEY?.trim() || undefined,
        turnstileSecretKey: source.TURNSTILE_SECRET_KEY?.trim() || undefined,
    };
}
