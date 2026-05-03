import type { Context } from "hono";
import { getRuntimeDb, toDbClient, type DbClient } from "./db.js";
import { readServerEnv } from "./env.js";
import type { AppBindings, AppEnv } from "../types.js";

function placeholderEnvValue(key: string): string {
  switch (key) {
    case "DATABASE_URL":
      return "postgres://placeholder";
    case "SUPABASE_URL":
      return "https://placeholder.supabase.co";
    case "SUPABASE_ANON_KEY":
    case "SUPABASE_SERVICE_ROLE_KEY":
      return "placeholder";
    case "TURNSTILE_SITE_KEY":
      return "test-site-key";
    default:
      return "placeholder";
  }
}

export function getAppBindings(c: Context<AppEnv>): AppBindings {
  const bindings = (c.env ?? {}) as AppBindings;

  return {
    DB: bindings.DB,
    IMAGES_BUCKET: bindings.IMAGES_BUCKET,
    SIGNUPS_OPEN: bindings.SIGNUPS_OPEN ?? process.env.SIGNUPS_OPEN,
    TURNSTILE_BYPASS: bindings.TURNSTILE_BYPASS ?? process.env.TURNSTILE_BYPASS,
    TURNSTILE_SITE_KEY:
      bindings.TURNSTILE_SITE_KEY ?? process.env.TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY:
      bindings.TURNSTILE_SECRET_KEY ?? process.env.TURNSTILE_SECRET_KEY,
  };
}

function getRuntimeEnvRecord(
  bindings: AppBindings,
): Record<string, string | undefined> {
  return {
    DATABASE_URL: process.env.DATABASE_URL ?? placeholderEnvValue("DATABASE_URL"),
    SUPABASE_URL: process.env.SUPABASE_URL ?? placeholderEnvValue("SUPABASE_URL"),
    SUPABASE_ANON_KEY:
      process.env.SUPABASE_ANON_KEY ?? placeholderEnvValue("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      placeholderEnvValue("SUPABASE_SERVICE_ROLE_KEY"),
    SIGNUPS_OPEN: bindings.SIGNUPS_OPEN ?? process.env.SIGNUPS_OPEN ?? "true",
    TURNSTILE_BYPASS:
      bindings.TURNSTILE_BYPASS ?? process.env.TURNSTILE_BYPASS ?? "true",
    TURNSTILE_SITE_KEY:
      bindings.TURNSTILE_SITE_KEY ??
      process.env.TURNSTILE_SITE_KEY ??
      placeholderEnvValue("TURNSTILE_SITE_KEY"),
    TURNSTILE_SECRET_KEY:
      bindings.TURNSTILE_SECRET_KEY ?? process.env.TURNSTILE_SECRET_KEY,
  };
}

export function getDb(c: Context<AppEnv>): DbClient {
  const cachedDb = c.get("db");
  if (cachedDb) {
    return cachedDb;
  }

  const bindings = getAppBindings(c);
  const db = bindings.DB
    ? toDbClient(bindings.DB)
    : getRuntimeDb(readServerEnv(getRuntimeEnvRecord(bindings)));

  c.set("db", db);
  return db;
}
