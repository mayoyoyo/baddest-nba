import { toDbClient } from "../lib/db.js";
export async function listPersonalImageState(db, userId) {
    const result = await toDbClient(db).query(`
      SELECT *
      FROM personal_image_state
      WHERE user_id = $1
      ORDER BY rating DESC, image_id ASC
    `, [userId]);
    return result.rows;
}
export async function listSharedImageState(db) {
    const result = await toDbClient(db).query(`
      SELECT *
      FROM shared_image_state
      ORDER BY rank_position ASC, aggregate_score DESC, image_id ASC
    `);
    return result.rows;
}
export async function listAllPersonalImageState(db) {
    const result = await toDbClient(db).query("SELECT * FROM personal_image_state ORDER BY user_id ASC, image_id ASC");
    return result.rows;
}
export async function listAllUserStates(db) {
    const result = await toDbClient(db).query("SELECT * FROM user_state ORDER BY user_id ASC");
    return result.rows;
}
export async function getUserState(db, userId) {
    const result = await toDbClient(db).query("SELECT * FROM user_state WHERE user_id = $1 LIMIT 1", [userId]);
    return result.rows[0] ?? null;
}
export async function upsertPersonalImageState(db, state) {
    await toDbClient(db).query(`
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
    `, [
        state.user_id,
        state.image_id,
        state.rating,
        state.comparisons,
        state.wins,
        state.losses,
        state.confidence,
        state.last_compared_at,
    ]);
}
export async function upsertUserState(db, state) {
    await toDbClient(db).query(`
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
    `, [
        state.user_id,
        state.total_votes_cast,
        state.ranking_confidence,
        state.recent_pair_cache,
        state.updated_at,
    ]);
}
export async function deletePersonalImageStateByImageId(db, imageId) {
    await toDbClient(db).query("DELETE FROM personal_image_state WHERE image_id = $1", [imageId]);
}
export async function replaceSharedImageState(db, rows) {
    const client = toDbClient(db);
    await client.query("DELETE FROM shared_image_state");
    for (const row of rows) {
        await client.query(`
        INSERT INTO shared_image_state (
          image_id,
          aggregate_score,
          rank_position,
          effective_voter_weight,
          confidence,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
            row.image_id,
            row.aggregate_score,
            row.rank_position,
            row.effective_voter_weight,
            row.confidence,
            row.updated_at,
        ]);
    }
}
export async function deleteSharedImageStateByImageId(db, imageId) {
    await toDbClient(db).query("DELETE FROM shared_image_state WHERE image_id = $1", [imageId]);
}
