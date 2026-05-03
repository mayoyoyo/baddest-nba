import { toDbClient, type DatabaseLike } from "../lib/db.js";

export interface PersonalImageStateRow {
  user_id: string;
  image_id: string;
  rating: number;
  comparisons: number;
  wins: number;
  losses: number;
  confidence: number;
  last_compared_at: string | null;
}

export interface SharedImageStateRow {
  image_id: string;
  aggregate_score: number;
  rank_position: number | null;
  effective_voter_weight: number;
  confidence: number;
  updated_at: string;
}

export interface UserStateRow {
  user_id: string;
  total_votes_cast: number;
  ranking_confidence: number;
  recent_pair_cache: string | null;
  updated_at: string;
}

export async function listPersonalImageState(
  db: DatabaseLike,
  userId: string,
): Promise<PersonalImageStateRow[]> {
  const result = await toDbClient(db).query<PersonalImageStateRow>(
    `
      SELECT *
      FROM personal_image_state
      WHERE user_id = $1
      ORDER BY rating DESC, image_id ASC
    `,
    [userId],
  );
  return result.rows;
}

export async function listSharedImageState(
  db: DatabaseLike,
): Promise<SharedImageStateRow[]> {
  const result = await toDbClient(db).query<SharedImageStateRow>(
    `
      SELECT *
      FROM shared_image_state
      ORDER BY rank_position ASC, aggregate_score DESC, image_id ASC
    `,
  );
  return result.rows;
}

export async function listAllPersonalImageState(
  db: DatabaseLike,
): Promise<PersonalImageStateRow[]> {
  const result = await toDbClient(db).query<PersonalImageStateRow>(
    "SELECT * FROM personal_image_state ORDER BY user_id ASC, image_id ASC",
  );
  return result.rows;
}

export async function listAllUserStates(
  db: DatabaseLike,
): Promise<UserStateRow[]> {
  const result = await toDbClient(db).query<UserStateRow>(
    "SELECT * FROM user_state ORDER BY user_id ASC",
  );
  return result.rows;
}

export async function getUserState(
  db: DatabaseLike,
  userId: string,
): Promise<UserStateRow | null> {
  const result = await toDbClient(db).query<UserStateRow>(
    "SELECT * FROM user_state WHERE user_id = $1 LIMIT 1",
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function upsertPersonalImageState(
  db: DatabaseLike,
  state: PersonalImageStateRow,
): Promise<void> {
  await toDbClient(db).query(
    `
      INSERT INTO personal_image_state (
        user_id,
        image_id,
        rating,
        comparisons,
        wins,
        losses,
        confidence,
        last_compared_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT(user_id, image_id) DO UPDATE SET
        rating = excluded.rating,
        comparisons = excluded.comparisons,
        wins = excluded.wins,
        losses = excluded.losses,
        confidence = excluded.confidence,
        last_compared_at = excluded.last_compared_at
    `,
    [
      state.user_id,
      state.image_id,
      state.rating,
      state.comparisons,
      state.wins,
      state.losses,
      state.confidence,
      state.last_compared_at,
    ],
  );
}

export async function upsertUserState(
  db: DatabaseLike,
  state: UserStateRow,
): Promise<void> {
  await toDbClient(db).query(
    `
      INSERT INTO user_state (
        user_id,
        total_votes_cast,
        ranking_confidence,
        recent_pair_cache,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT(user_id) DO UPDATE SET
        total_votes_cast = excluded.total_votes_cast,
        ranking_confidence = excluded.ranking_confidence,
        recent_pair_cache = excluded.recent_pair_cache,
        updated_at = excluded.updated_at
    `,
    [
      state.user_id,
      state.total_votes_cast,
      state.ranking_confidence,
      state.recent_pair_cache,
      state.updated_at,
    ],
  );
}

export async function deletePersonalImageStateByImageId(
  db: DatabaseLike,
  imageId: string,
): Promise<void> {
  await toDbClient(db).query(
    "DELETE FROM personal_image_state WHERE image_id = $1",
    [imageId],
  );
}

export async function replaceSharedImageState(
  db: DatabaseLike,
  rows: SharedImageStateRow[],
): Promise<void> {
  const client = toDbClient(db);
  await client.query("DELETE FROM shared_image_state");

  for (const row of rows) {
    await client.query(
      `
        INSERT INTO shared_image_state (
          image_id,
          aggregate_score,
          rank_position,
          effective_voter_weight,
          confidence,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        row.image_id,
        row.aggregate_score,
        row.rank_position,
        row.effective_voter_weight,
        row.confidence,
        row.updated_at,
      ],
    );
  }
}

export async function deleteSharedImageStateByImageId(
  db: DatabaseLike,
  imageId: string,
): Promise<void> {
  await toDbClient(db).query(
    "DELETE FROM shared_image_state WHERE image_id = $1",
    [imageId],
  );
}

export async function getTopRatedImageIdForUser(
  db: DatabaseLike,
  userId: string,
): Promise<string | null> {
  const result = await toDbClient(db).query<{ image_id: string }>(
    `SELECT image_id FROM personal_image_state
     WHERE user_id = $1
     ORDER BY rating DESC, comparisons DESC, image_id ASC
     LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.image_id ?? null;
}
