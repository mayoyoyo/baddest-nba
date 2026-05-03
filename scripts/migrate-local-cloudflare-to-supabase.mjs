import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { Pool } = pg;

const rootDir = process.cwd();
const localD1Path = path.join(
  rootDir,
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/e7352547963de7050bd7d94658afc4fe78b61811b7815da12d90be8e863abf4d.sqlite",
);
const localR2MetadataPath = path.join(
  rootDir,
  ".wrangler/state/v3/r2/miniflare-R2BucketObject/cb6ff3032fdab853588a720f5ca6593d5bc396358de71e004e85290657959add.sqlite",
);
const localR2BlobsDir = path.join(
  rootDir,
  ".wrangler/state/v3/r2/IMAGES_BUCKET/blobs",
);
const imageBucketName = "images";

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function readSqliteJson(dbPath, sql) {
  const output = execFileSync("sqlite3", ["-json", dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();

  return output ? JSON.parse(output) : [];
}

async function ensureBucket(supabase) {
  const { data, error } = await supabase.storage.getBucket(imageBucketName);
  if (error && !error.message.toLowerCase().includes("not found")) {
    throw new Error(`Failed to read bucket: ${error.message}`);
  }

  if (data) {
    return;
  }

  const created = await supabase.storage.createBucket(imageBucketName, {
    public: false,
  });

  if (created.error) {
    throw new Error(`Failed to create bucket: ${created.error.message}`);
  }
}

async function uploadImageObjects(supabase, objects) {
  for (const object of objects) {
    const metadata = object.http_metadata
      ? JSON.parse(object.http_metadata)
      : {};
    const contentType = metadata.contentType ?? "application/octet-stream";
    const blobPath = path.join(localR2BlobsDir, object.blob_id);
    const body = await fs.readFile(blobPath);
    const { error } = await supabase.storage
      .from(imageBucketName)
      .upload(object.key, body, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Failed to upload ${object.key}: ${error.message}`);
    }
  }
}

async function replaceTableRows(client, tableName, columns, rows) {
  if (rows.length === 0) {
    return;
  }

  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const sql = `insert into ${tableName} (${columns.join(", ")}) values (${placeholders})`;

  for (const row of rows) {
    await client.query(
      sql,
      columns.map((column) => row[column] ?? null),
    );
  }
}

async function main() {
  const databaseUrl = readRequiredEnv("DATABASE_URL");
  const supabaseUrl = readRequiredEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const users = readSqliteJson(localD1Path, "select * from users");
  const sessions = readSqliteJson(localD1Path, "select * from sessions");
  const images = readSqliteJson(localD1Path, "select * from images");
  const voteEvents = readSqliteJson(localD1Path, "select * from vote_events");
  const personalImageState = readSqliteJson(
    localD1Path,
    "select * from personal_image_state",
  );
  const sharedImageState = readSqliteJson(
    localD1Path,
    "select * from shared_image_state",
  );
  const userState = readSqliteJson(localD1Path, "select * from user_state");
  const authAttempts = readSqliteJson(
    localD1Path,
    "select * from auth_attempts",
  );
  const r2Objects = readSqliteJson(
    localR2MetadataPath,
    "select key, blob_id, http_metadata from _mf_objects",
  );

  await ensureBucket(supabase);
  await uploadImageObjects(supabase, r2Objects);

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      "truncate table auth_attempts, sessions, personal_image_state, shared_image_state, vote_events, user_state, images, users cascade",
    );

    await replaceTableRows(client, "users", [
      "id",
      "username",
      "pin_hash",
      "role",
      "created_at",
      "last_active_at",
      "failed_login_count",
      "locked_until",
    ], users);
    await replaceTableRows(client, "sessions", [
      "id",
      "user_id",
      "token_hash",
      "created_at",
      "expires_at",
      "last_seen_at",
      "ip_hash",
    ], sessions);
    await replaceTableRows(client, "images", [
      "id",
      "r2_key_original",
      "r2_key_display",
      "width",
      "height",
      "mime_type",
      "sort_order",
      "status",
      "uploaded_by",
      "created_at",
    ], images);
    await replaceTableRows(client, "vote_events", [
      "id",
      "user_id",
      "winner_image_id",
      "loser_image_id",
      "context",
      "created_at",
    ], voteEvents);
    await replaceTableRows(client, "personal_image_state", [
      "user_id",
      "image_id",
      "rating",
      "comparisons",
      "wins",
      "losses",
      "confidence",
      "last_compared_at",
    ], personalImageState);
    await replaceTableRows(client, "shared_image_state", [
      "image_id",
      "aggregate_score",
      "rank_position",
      "effective_voter_weight",
      "confidence",
      "updated_at",
    ], sharedImageState);
    await replaceTableRows(client, "user_state", [
      "user_id",
      "total_votes_cast",
      "ranking_confidence",
      "recent_pair_cache",
      "updated_at",
    ], userState);
    await replaceTableRows(client, "auth_attempts", [
      "key",
      "attempts",
      "window_started_at",
      "blocked_until",
    ], authAttempts);

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(
    JSON.stringify({
      authAttempts: authAttempts.length,
      images: images.length,
      personalImageState: personalImageState.length,
      r2Objects: r2Objects.length,
      sessions: sessions.length,
      sharedImageState: sharedImageState.length,
      users: users.length,
      userState: userState.length,
      voteEvents: voteEvents.length,
    }),
  );
}

await main();
