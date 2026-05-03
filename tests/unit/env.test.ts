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
        SIGNUPS_OPEN: "true",
        TURNSTILE_BYPASS: "true",
        TURNSTILE_SITE_KEY: "site-key",
      }),
    ).toEqual({
      databaseUrl: "postgres://example",
      signupsOpen: true,
      turnstileBypass: true,
      turnstileSiteKey: "site-key",
      turnstileSecretKey: undefined,
    });
  });

  it("treats SIGNUPS_OPEN=false as closed", () => {
    expect(
      readServerEnv({
        DATABASE_URL: "postgres://example",
        SIGNUPS_OPEN: "false",
        TURNSTILE_BYPASS: "true",
      }).signupsOpen,
    ).toBe(false);
  });
});
