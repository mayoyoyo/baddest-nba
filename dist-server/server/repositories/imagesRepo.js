import { toDbClient } from "../lib/db.js";
export async function createImage(db, image) {
    await toDbClient(db).query(`
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
    `, [
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
    ]);
}
export async function getNextSortOrder(db) {
    const result = await toDbClient(db).query(`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
      FROM images
    `);
    return result.rows[0]?.next_sort_order ?? 0;
}
export async function listActiveImages(db) {
    const result = await toDbClient(db).query(`
      SELECT *
      FROM images
      WHERE status = 'active'
      ORDER BY sort_order ASC, created_at ASC
    `);
    return result.rows;
}
export async function listAllImages(db) {
    const result = await toDbClient(db).query(`
      SELECT *
      FROM images
      ORDER BY id ASC
    `);
    return result.rows;
}
export async function getImageById(db, imageId) {
    const result = await toDbClient(db).query("SELECT * FROM images WHERE id = $1 LIMIT 1", [imageId]);
    return result.rows[0] ?? null;
}
export async function deleteImageById(db, imageId) {
    await toDbClient(db).query("DELETE FROM images WHERE id = $1", [imageId]);
}
export async function updateImageAsset(db, input) {
    await toDbClient(db).query(`
      UPDATE images
      SET
        r2_key_original = $1,
        r2_key_display = $2,
        width = $3,
        height = $4,
        mime_type = $5,
        uploaded_by = $6
      WHERE id = $7
    `, [
        input.r2_key_original,
        input.r2_key_display,
        input.width,
        input.height,
        input.mime_type,
        input.uploaded_by,
        input.id,
    ]);
}
