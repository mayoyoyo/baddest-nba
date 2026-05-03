import { toDbClient, type DatabaseLike } from "./db.js";

const AUTH_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

interface AuthAttemptRow {
  key: string;
  attempts: number;
  window_started_at: string;
  blocked_until: string | null;
}

export interface RateLimitStatus {
  blocked: boolean;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createAuthAttemptKey(
  scope: string,
  username: string,
  ipAddress: string | null,
): Promise<string> {
  const ipPart = ipAddress ?? "unknown";
  return sha256Hex(`${scope}:${username}:${ipPart}`);
}

export async function getRateLimitStatus(
  db: DatabaseLike,
  key: string,
  now = new Date(),
): Promise<RateLimitStatus> {
  const result = await toDbClient(db).query<AuthAttemptRow>(
    "SELECT * FROM auth_attempts WHERE key = $1 LIMIT 1",
    [key],
  );
  const attempt = result.rows[0] ?? null;

  if (!attempt?.blocked_until) {
    return { blocked: false };
  }

  return {
    blocked: new Date(attempt.blocked_until).getTime() > now.getTime(),
  };
}

export async function recordRateLimitFailure(
  db: DatabaseLike,
  key: string,
  now = new Date(),
): Promise<RateLimitStatus> {
  const client = toDbClient(db);
  const currentResult = await client.query<AuthAttemptRow>(
    "SELECT * FROM auth_attempts WHERE key = $1 LIMIT 1",
    [key],
  );
  const current = currentResult.rows[0] ?? null;

  const windowStart = current
    ? new Date(current.window_started_at)
    : now;
  const withinWindow = now.getTime() - windowStart.getTime() <= AUTH_WINDOW_MS;
  const attempts = withinWindow ? (current?.attempts ?? 0) + 1 : 1;
  const blocked = attempts >= MAX_FAILED_ATTEMPTS;
  const blockedUntil = blocked
    ? new Date(now.getTime() + AUTH_WINDOW_MS).toISOString()
    : null;
  const nextWindowStart = withinWindow ? current?.window_started_at ?? now.toISOString() : now.toISOString();

  await client.query(
    `
      INSERT INTO auth_attempts (key, attempts, window_started_at, blocked_until)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(key) DO UPDATE SET
        attempts = excluded.attempts,
        window_started_at = excluded.window_started_at,
        blocked_until = excluded.blocked_until
    `,
    [key, attempts, nextWindowStart, blockedUntil],
  );

  return { blocked };
}

export async function clearRateLimit(
  db: DatabaseLike,
  key: string,
): Promise<void> {
  await toDbClient(db).query(
    "DELETE FROM auth_attempts WHERE key = $1",
    [key],
  );
}
