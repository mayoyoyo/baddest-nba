import { describe, expect, it } from "vitest";
import { readServerEnv } from "../../src/server/lib/env";

describe("readServerEnv", () => {
  it("throws when DATABASE_URL is missing", () => {
    expect(() => readServerEnv({})).toThrow(/DATABASE_URL/);
  });

  it("returns the configured server env values", () => {
    expect(
      readServerEnv({
        DATABASE_URL: "postgres://example",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        TURNSTILE_BYPASS: "true",
        TURNSTILE_SITE_KEY: "site-key",
      }),
    ).toEqual({
      databaseUrl: "postgres://example",
      supabaseUrl: "https://project.supabase.co",
      supabaseAnonKey: "anon",
      supabaseServiceRoleKey: "service-role",
      turnstileBypass: true,
      turnstileSiteKey: "site-key",
      turnstileSecretKey: undefined,
    });
  });
});
