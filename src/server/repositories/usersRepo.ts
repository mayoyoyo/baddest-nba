import { toDbClient, type DatabaseLike } from "../lib/db.js";

export interface UserRow {
  id: string;
  username: string;
  pin_hash: string;
  role: string;
  created_at: string;
  last_active_at: string | null;
  failed_login_count: number;
  locked_until: string | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  ip_hash: string | null;
}

export async function createUser(
  db: DatabaseLike,
  user: UserRow,
): Promise<void> {
  await toDbClient(db).query(
    `
      INSERT INTO users (
        id,
        username,
        pin_hash,
        role,
        created_at,
        last_active_at,
        failed_login_count,
        locked_until
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      user.id,
      user.username,
      user.pin_hash,
      user.role,
      user.created_at,
      user.last_active_at,
      user.failed_login_count,
      user.locked_until,
    ],
  );
}

export async function createSession(
  db: DatabaseLike,
  session: SessionRow,
): Promise<void> {
  await toDbClient(db).query(
    `
      INSERT INTO sessions (
        id,
        user_id,
        token_hash,
        created_at,
        expires_at,
        last_seen_at,
        ip_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      session.id,
      session.user_id,
      session.token_hash,
      session.created_at,
      session.expires_at,
      session.last_seen_at,
      session.ip_hash,
    ],
  );
}

export async function getUserById(
  db: DatabaseLike,
  userId: string,
): Promise<UserRow | null> {
  const result = await toDbClient(db).query<UserRow>(
    "SELECT * FROM users WHERE id = $1 LIMIT 1",
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function getUserByUsername(
  db: DatabaseLike,
  username: string,
): Promise<UserRow | null> {
  const result = await toDbClient(db).query<UserRow>(
    "SELECT * FROM users WHERE username = $1 LIMIT 1",
    [username],
  );
  return result.rows[0] ?? null;
}

export async function listUsers(db: DatabaseLike): Promise<UserRow[]> {
  const result = await toDbClient(db).query<UserRow>(
    "SELECT * FROM users ORDER BY username ASC",
  );
  return result.rows;
}

export async function getSessionByTokenHash(
  db: DatabaseLike,
  tokenHash: string,
): Promise<SessionRow | null> {
  const result = await toDbClient(db).query<SessionRow>(
    "SELECT * FROM sessions WHERE token_hash = $1 LIMIT 1",
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function deleteSessionByTokenHash(
  db: DatabaseLike,
  tokenHash: string,
): Promise<void> {
  await toDbClient(db).query(
    "DELETE FROM sessions WHERE token_hash = $1",
    [tokenHash],
  );
}
