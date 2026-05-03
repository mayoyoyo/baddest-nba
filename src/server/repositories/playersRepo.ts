import type { DatabaseLike } from "../lib/db.js";
import { toDbClient } from "../lib/db.js";

export interface PlayerRow {
  id: string;
  first: string;
  last: string;
  team: string | null;
  team_full: string | null;
  jersey: string | null;
  pos: string | null;
}

export async function listAllPlayers(
  db: DatabaseLike,
): Promise<PlayerRow[]> {
  const result = await toDbClient(db).query<PlayerRow>(
    "select id, first, last, team, team_full, jersey, pos from players",
  );
  return result.rows;
}

export async function listPlayersByImageIds(
  db: DatabaseLike,
  imageIds: string[],
): Promise<PlayerRow[]> {
  if (imageIds.length === 0) {
    return [];
  }

  const result = await toDbClient(db).query<PlayerRow>(
    `select id, first, last, team, team_full, jersey, pos
     from players
     where id = any($1::text[])`,
    [imageIds],
  );
  return result.rows;
}
