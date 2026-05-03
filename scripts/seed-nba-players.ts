import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresDb, type DbClient } from "../src/server/lib/db.js";

interface PlayerEntry {
  id: number;
  first: string;
  last: string;
  slug: string;
  team: string;
  team_full: string;
  jersey: string;
  pos: string;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(moduleDir, "..");
const playersPath = resolve(repoRoot, "data/players.json");

const SYSTEM_USER_ID = "system";
const SYSTEM_USERNAME = "system";
const NBA_HEADSHOT_WIDTH = 1040;
const NBA_HEADSHOT_HEIGHT = 760;
const NBA_HEADSHOT_MIME = "image/png";

function readPlayers(): PlayerEntry[] {
  const raw = readFileSync(playersPath, "utf-8");
  const parsed = JSON.parse(raw) as PlayerEntry[];
  if (!Array.isArray(parsed)) {
    throw new Error("data/players.json is not an array");
  }
  return parsed;
}

async function ensureSystemUser(tx: DbClient): Promise<void> {
  const existing = await tx.query(
    "select id from users where id = $1 limit 1",
    [SYSTEM_USER_ID],
  );
  if (existing.rowCount > 0) {
    return;
  }

  await tx.query(
    `insert into users (id, username, pin_hash, role, created_at,
       last_active_at, failed_login_count, locked_until)
     values ($1, $2, $3, 'admin', now(), null, 0, null)`,
    [SYSTEM_USER_ID, SYSTEM_USERNAME, "seed:no-login"],
  );
}

async function upsertPlayer(
  tx: DbClient,
  player: PlayerEntry,
  sortOrder: number,
): Promise<void> {
  const imageId = String(player.id);
  const createdAt = new Date().toISOString();

  await tx.query(
    `insert into images (id, r2_key_original, r2_key_display, width, height,
       mime_type, sort_order, status, uploaded_by, created_at)
     values ($1, null, null, $2, $3, $4, $5, 'active', $6, $7)
     on conflict (id) do update set
       width = excluded.width,
       height = excluded.height,
       mime_type = excluded.mime_type,
       sort_order = excluded.sort_order,
       status = case
         when images.status = 'hidden' then 'active'
         else images.status
       end`,
    [
      imageId,
      NBA_HEADSHOT_WIDTH,
      NBA_HEADSHOT_HEIGHT,
      NBA_HEADSHOT_MIME,
      sortOrder,
      SYSTEM_USER_ID,
      createdAt,
    ],
  );

  await tx.query(
    `insert into players (id, first, last, team, team_full, jersey, pos)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (id) do update set
       first = excluded.first,
       last = excluded.last,
       team = excluded.team,
       team_full = excluded.team_full,
       jersey = excluded.jersey,
       pos = excluded.pos`,
    [
      imageId,
      player.first,
      player.last,
      player.team || null,
      player.team_full || null,
      player.jersey || null,
      player.pos || null,
    ],
  );
}

async function hideMissingPlayers(
  tx: DbClient,
  activeImageIds: Set<string>,
): Promise<number> {
  const result = await tx.query<{ id: string }>(
    `select id from images where status = 'active'`,
  );

  const toHide = result.rows
    .map((row) => row.id)
    .filter((id) => !activeImageIds.has(id));

  if (toHide.length === 0) {
    return 0;
  }

  await tx.query(
    `update images set status = 'hidden' where id = any($1::text[])`,
    [toHide],
  );

  return toHide.length;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const players = readPlayers();
  console.log(`loaded ${players.length} players from data/players.json`);

  const db = createPostgresDb(databaseUrl);
  const activeImageIds = new Set(players.map((p) => String(p.id)));

  await db.transaction(async (tx) => {
    await ensureSystemUser(tx);

    for (const [index, player] of players.entries()) {
      await upsertPlayer(tx, player, index);
    }

    const hiddenCount = await hideMissingPlayers(tx, activeImageIds);
    console.log(
      `upserted ${players.length} players; hid ${hiddenCount} stale entries`,
    );
  });

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
