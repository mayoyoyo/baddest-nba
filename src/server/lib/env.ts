export interface ServerEnv {
  databaseUrl: string;
  signupsOpen: boolean;
  turnstileBypass: boolean;
  turnstileSecretKey?: string;
  turnstileSiteKey?: string;
}

function readRequired(
  source: Record<string, string | undefined>,
  key: string,
): string {
  const value = source[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

export function readServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  return {
    databaseUrl: readRequired(source, "DATABASE_URL"),
    signupsOpen: source.SIGNUPS_OPEN !== "false",
    turnstileBypass: source.TURNSTILE_BYPASS === "true",
    turnstileSiteKey: source.TURNSTILE_SITE_KEY?.trim() || undefined,
    turnstileSecretKey: source.TURNSTILE_SECRET_KEY?.trim() || undefined,
  };
}
