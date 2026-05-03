import { toDbClient, type DatabaseLike } from "../lib/db.js";

export interface ImageRow {
  id: string;
  r2_key_original: string;
  r2_key_display: string;
  width: number;
  height: number;
  mime_type: string;
  sort_order: number;
  status: "active" | "hidden";
  uploaded_by: string;
  created_at: string;
}

export async function createImage(
  db: DatabaseLike,
  image: ImageRow,
): Promise<void> {
  await toDbClient(db).query(
    `
      INSERT INTO images (
        id,
        r2_key_original,
        r2_key_display,
        width,
        height,
        mime_type,
        sort_order,
        status,
        uploaded_by,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      image.id,
      image.r2_key_original,
      image.r2_key_display,
      image.width,
      image.height,
      image.mime_type,
      image.sort_order,
      image.status,
      image.uploaded_by,
      image.created_at,
    ],
  );
}

export async function getNextSortOrder(db: DatabaseLike): Promise<number> {
  const result = await toDbClient(db).query<{ next_sort_order: number }>(
    `
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
      FROM images
    `,
  );

  return result.rows[0]?.next_sort_order ?? 0;
}

export async function listActiveImages(db: DatabaseLike): Promise<ImageRow[]> {
  const result = await toDbClient(db).query<ImageRow>(
    `
      SELECT *
      FROM images
      WHERE status = 'active'
      ORDER BY sort_order ASC, created_at ASC
    `,
  );
  return result.rows;
}

export async function listAllImages(db: DatabaseLike): Promise<ImageRow[]> {
  const result = await toDbClient(db).query<ImageRow>(
    `
      SELECT *
      FROM images
      ORDER BY id ASC
    `,
  );
  return result.rows;
}

export async function getImageById(
  db: DatabaseLike,
  imageId: string,
): Promise<ImageRow | null> {
  const result = await toDbClient(db).query<ImageRow>(
    "SELECT * FROM images WHERE id = $1 LIMIT 1",
    [imageId],
  );
  return result.rows[0] ?? null;
}

export async function deleteImageById(
  db: DatabaseLike,
  imageId: string,
): Promise<void> {
  await toDbClient(db).query("DELETE FROM images WHERE id = $1", [imageId]);
}

export async function updateImageAsset(
  db: DatabaseLike,
  input: {
    id: string;
    r2_key_original: string;
    r2_key_display: string;
    width: number;
    height: number;
    mime_type: string;
    uploaded_by: string;
  },
): Promise<void> {
  await toDbClient(db).query(
    `
      UPDATE images
      SET
        r2_key_original = $1,
        r2_key_display = $2,
        width = $3,
        height = $4,
        mime_type = $5,
        uploaded_by = $6
      WHERE id = $7
    `,
    [
      input.r2_key_original,
      input.r2_key_display,
      input.width,
      input.height,
      input.mime_type,
      input.uploaded_by,
      input.id,
    ],
  );
}
