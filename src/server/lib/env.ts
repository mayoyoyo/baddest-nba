export interface ServerEnv {
  databaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
  turnstileBypass: boolean;
  turnstileSecretKey?: string;
  turnstileSiteKey: string;
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
    supabaseUrl: readRequired(source, "SUPABASE_URL"),
    supabaseAnonKey: readRequired(source, "SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: readRequired(source, "SUPABASE_SERVICE_ROLE_KEY"),
    turnstileBypass: source.TURNSTILE_BYPASS === "true",
    turnstileSiteKey: readRequired(source, "TURNSTILE_SITE_KEY"),
    turnstileSecretKey: source.TURNSTILE_SECRET_KEY?.trim() || undefined,
  };
}
