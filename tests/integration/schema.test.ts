import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("schema", () => {
  it("creates the users table with unique usernames", async () => {
    const firstInsert = env.DB
      .prepare(
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
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        "user-1",
        "warren",
        "hashed-pin",
        "user",
        "2026-04-17T00:00:00.000Z",
        null,
        0,
        null,
      )
      .run();

    await expect(firstInsert).resolves.toMatchObject({
      success: true,
    });

    const duplicateInsert = env.DB
      .prepare(
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
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        "user-2",
        "warren",
        "hashed-pin-2",
        "user",
        "2026-04-17T00:00:00.000Z",
        null,
        0,
        null,
      )
      .run();

    await expect(duplicateInsert).rejects.toThrow(
      /UNIQUE constraint failed: users\.username/,
    );
  });
});
