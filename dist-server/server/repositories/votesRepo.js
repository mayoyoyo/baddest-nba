import { toDbClient } from "../lib/db.js";
export async function countVotesByUserId(db, userId) {
    const result = await toDbClient(db).query(`
      SELECT COUNT(*) AS total_votes_cast
      FROM vote_events
      WHERE user_id = $1
    `, [userId]);
    return Number(result.rows[0]?.total_votes_cast ?? 0);
}
export async function getVoteEventById(db, voteEventId) {
    const result = await toDbClient(db).query("SELECT * FROM vote_events WHERE id = $1 LIMIT 1", [voteEventId]);
    return result.rows[0] ?? null;
}
export async function createVoteEvent(db, voteEvent) {
    await toDbClient(db).query(`
      INSERT INTO vote_events (
        id,
        user_id,
        winner_image_id,
        loser_image_id,
        context,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
        voteEvent.id,
        voteEvent.user_id,
        voteEvent.winner_image_id,
        voteEvent.loser_image_id,
        voteEvent.context,
        voteEvent.created_at,
    ]);
}
