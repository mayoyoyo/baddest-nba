import type { Context } from "hono";
import { getRuntimeDb, type DbClient } from "./db.js";
import { readServerEnv } from "./env.js";
import type { AppBindings, AppEnv } from "../types.js";

export function getAppBindings(c: Context<AppEnv>): AppBindings {
  const env = (c.env ?? {}) as AppBindings;

  return {
    SIGNUPS_OPEN: env.SIGNUPS_OPEN ?? process.env.SIGNUPS_OPEN,
    TURNSTILE_BYPASS: env.TURNSTILE_BYPASS ?? process.env.TURNSTILE_BYPASS,
    TURNSTILE_SITE_KEY:
      env.TURNSTILE_SITE_KEY ?? process.env.TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY:
      env.TURNSTILE_SECRET_KEY ?? process.env.TURNSTILE_SECRET_KEY,
  };
}

function getRuntimeEnvRecord(
  bindings: AppBindings,
): Record<string, string | undefined> {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SIGNUPS_OPEN: bindings.SIGNUPS_OPEN ?? "true",
    TURNSTILE_BYPASS: bindings.TURNSTILE_BYPASS ?? "false",
    TURNSTILE_SITE_KEY: bindings.TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY: bindings.TURNSTILE_SECRET_KEY,
  };
}

export function getDb(c: Context<AppEnv>): DbClient {
  const cachedDb = c.get("db");
  if (cachedDb) {
    return cachedDb;
  }

  const bindings = getAppBindings(c);
  const db = getRuntimeDb(readServerEnv(getRuntimeEnvRecord(bindings)));

  c.set("db", db);
  return db;
}
