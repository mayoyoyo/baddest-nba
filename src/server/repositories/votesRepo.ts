import { toDbClient, type DatabaseLike } from "../lib/db.js";

export interface VoteCountRow {
  total_votes_cast: number;
}

export interface VoteEventRow {
  id: string;
  user_id: string;
  winner_image_id: string;
  loser_image_id: string;
  context: string;
  created_at: string;
}

export async function countVotesByUserId(
  db: DatabaseLike,
  userId: string,
): Promise<number> {
  const result = await toDbClient(db).query<VoteCountRow>(
    `
      SELECT COUNT(*) AS total_votes_cast
      FROM vote_events
      WHERE user_id = $1
    `,
    [userId],
  );

  return Number(result.rows[0]?.total_votes_cast ?? 0);
}

export async function getVoteEventById(
  db: DatabaseLike,
  voteEventId: string,
): Promise<VoteEventRow | null> {
  const result = await toDbClient(db).query<VoteEventRow>(
    "SELECT * FROM vote_events WHERE id = $1 LIMIT 1",
    [voteEventId],
  );

  return result.rows[0] ?? null;
}

export async function createVoteEvent(
  db: DatabaseLike,
  voteEvent: VoteEventRow,
): Promise<void> {
  await toDbClient(db).query(
    `
      INSERT INTO vote_events (
        id,
        user_id,
        winner_image_id,
        loser_image_id,
        context,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      voteEvent.id,
      voteEvent.user_id,
      voteEvent.winner_image_id,
      voteEvent.loser_image_id,
      voteEvent.context,
      voteEvent.created_at,
    ],
  );
}
