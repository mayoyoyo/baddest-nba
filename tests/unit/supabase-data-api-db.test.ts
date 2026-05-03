import { describe, expect, it } from "vitest";
import {
  createDataApiDb,
  type DataApiAdapter,
  type DataApiFilter,
  type DataApiOrder,
} from "../../src/server/lib/db";

type Row = Record<string, unknown>;

function applyFilters(rows: Row[], filters: DataApiFilter[] = []): Row[] {
  return rows.filter((row) =>
    filters.every((filter) => {
      if (filter.op === "eq") {
        return row[filter.column] === filter.value;
      }

      if (filter.op === "not-null") {
        return row[filter.column] !== null && row[filter.column] !== undefined;
      }

      return false;
    }),
  );
}

function applyOrder(rows: Row[], orderBy: DataApiOrder[] = []): Row[] {
  return [...rows].sort((left, right) => {
    for (const order of orderBy) {
      const leftValue = left[order.column];
      const rightValue = right[order.column];

      if (leftValue === rightValue) {
        continue;
      }

      if (leftValue === undefined || leftValue === null) {
        return order.ascending ? -1 : 1;
      }

      if (rightValue === undefined || rightValue === null) {
        return order.ascending ? 1 : -1;
      }

      if (leftValue < rightValue) {
        return order.ascending ? -1 : 1;
      }

      if (leftValue > rightValue) {
        return order.ascending ? 1 : -1;
      }
    }

    return 0;
  });
}

function createInMemoryAdapter(seed: Partial<Record<string, Row[]>> = {}): DataApiAdapter {
  const tables = new Map<string, Row[]>(
    Object.entries(seed).map(([table, rows]) => [table, [...(rows ?? [])]]),
  );

  function getTable(table: string): Row[] {
    const rows = tables.get(table) ?? [];
    if (!tables.has(table)) {
      tables.set(table, rows);
    }
    return rows;
  }

  return {
    async count(table, filters = []) {
      return applyFilters(getTable(table), filters).length;
    },

    async delete(table, filters = []) {
      const rows = getTable(table);
      const remaining = rows.filter((row) => !applyFilters([row], filters).length);
      const deletedCount = rows.length - remaining.length;
      tables.set(table, remaining);
      return deletedCount;
    },

    async insert(table, row) {
      getTable(table).push({ ...row });
    },

    async select<T extends Row>(table: string, options: {
      filters?: DataApiFilter[];
      limit?: number;
      orderBy?: DataApiOrder[];
    } = {}) {
      const rows = applyOrder(
        applyFilters(getTable(table), options.filters),
        options.orderBy,
      );
      return (
        typeof options.limit === "number" ? rows.slice(0, options.limit) : rows
      ) as T[];
    },

    async upsert(table, row, conflictColumns) {
      const rows = getTable(table);
      const index = rows.findIndex((existing) =>
        conflictColumns.every((column) => existing[column] === row[column]),
      );

      if (index === -1) {
        rows.push({ ...row });
        return;
      }

      rows[index] = { ...rows[index], ...row };
    },
  };
}

describe("createDataApiDb", () => {
  it("supports the auth and session SQL used by the runtime", async () => {
    const db = createDataApiDb(createInMemoryAdapter());

    await db.query(
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        "user-1",
        "warren",
        "hashed-pin",
        "user",
        "2026-04-18T00:00:00.000Z",
        "2026-04-18T00:00:00.000Z",
        0,
        null,
      ],
    );

    const userByUsername = await db.query(
      "SELECT * FROM users WHERE username = $1 LIMIT 1",
      ["warren"],
    );
    expect(userByUsername.rows[0]).toMatchObject({
      id: "user-1",
      username: "warren",
    });

    const userById = await db.query(
      "SELECT * FROM users WHERE id = $1 LIMIT 1",
      ["user-1"],
    );
    expect(userById.rows[0]).toMatchObject({
      username: "warren",
    });

    await db.query(
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        "user-2",
        "riley",
        "hashed-pin-2",
        "user",
        "2026-04-18T00:00:01.000Z",
        "2026-04-18T00:00:01.000Z",
        0,
        null,
      ],
    );

    const users = await db.query("SELECT * FROM users ORDER BY username ASC");
    expect(users.rows.map((row) => row.username)).toEqual(["riley", "warren"]);

    await db.query(
      `
        INSERT INTO sessions (
          id,
          user_id,
          token_hash,
          created_at,
          expires_at,
          last_seen_at,
          ip_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        "session-1",
        "user-1",
        "token-hash-1",
        "2026-04-18T00:00:00.000Z",
        "2026-05-18T00:00:00.000Z",
        "2026-04-18T00:00:00.000Z",
        "127.0.0.1",
      ],
    );

    const session = await db.query(
      "SELECT * FROM sessions WHERE token_hash = $1 LIMIT 1",
      ["token-hash-1"],
    );
    expect(session.rows[0]).toMatchObject({
      id: "session-1",
      user_id: "user-1",
    });

    await db.query(
      `
        INSERT INTO auth_attempts (key, attempts, window_started_at, blocked_until)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT(key) DO UPDATE SET
          attempts = excluded.attempts,
          window_started_at = excluded.window_started_at,
          blocked_until = excluded.blocked_until
      `,
      ["attempt-1", 2, "2026-04-18T00:00:00.000Z", null],
    );

    const authAttempt = await db.query(
      "SELECT * FROM auth_attempts WHERE key = $1 LIMIT 1",
      ["attempt-1"],
    );
    expect(authAttempt.rows[0]).toMatchObject({
      key: "attempt-1",
      attempts: 2,
    });

    await db.query("DELETE FROM auth_attempts WHERE key = $1", ["attempt-1"]);
    expect(
      (
        await db.query("SELECT * FROM auth_attempts WHERE key = $1 LIMIT 1", [
          "attempt-1",
        ])
      ).rows,
    ).toEqual([]);

    await db.query("DELETE FROM sessions WHERE token_hash = $1", ["token-hash-1"]);
    expect(
      (
        await db.query("SELECT * FROM sessions WHERE token_hash = $1 LIMIT 1", [
          "token-hash-1",
        ])
      ).rows,
    ).toEqual([]);
  });

  it("supports image, vote, and leaderboard SQL used by the runtime", async () => {
    const db = createDataApiDb(createInMemoryAdapter());

    await db.query(
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
        "Image A",
        "images/a/original",
        "images/a/display",
        100,
        100,
        "image/jpeg",
        0,
        "active",
        "user-1",
        "2026-04-18T00:00:00.000Z",
      ],
    );
    await db.query(
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
        "Image B",
        "images/b/original",
        "images/b/display",
        100,
        100,
        "image/jpeg",
        1,
        "active",
        "user-1",
        "2026-04-18T00:00:01.000Z",
      ],
    );

    const nextSortOrder = await db.query(
      `
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
        FROM images
      `,
    );
    expect(nextSortOrder.rows[0]).toEqual({ next_sort_order: 2 });

    const activeImages = await db.query(
      `
        SELECT *
        FROM images
        WHERE status = 'active'
        ORDER BY sort_order ASC, created_at ASC
      `,
    );
    expect(activeImages.rows.map((row) => row.id)).toEqual(["Image A", "Image B"]);

    await db.query(
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
        "vote-1",
        "user-1",
        "Image A",
        "Image B",
        "shared_pool_vote",
        "2026-04-18T00:00:02.000Z",
      ],
    );

    const voteCount = await db.query(
      `
        SELECT COUNT(*) AS total_votes_cast
        FROM vote_events
        WHERE user_id = $1
      `,
      ["user-1"],
    );
    expect(voteCount.rows[0]).toEqual({ total_votes_cast: 1 });

    const voteById = await db.query(
      "SELECT * FROM vote_events WHERE id = $1 LIMIT 1",
      ["vote-1"],
    );
    expect(voteById.rows[0]).toMatchObject({
      id: "vote-1",
      winner_image_id: "Image A",
    });

    await db.query(
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
      ["user-1", "Image A", 1240, 1, 1, 0, 0.5, "2026-04-18T00:00:02.000Z"],
    );

    await db.query(
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
      ["user-1", 1, 0.4, "[[\"Image A\",\"Image B\"]]", "2026-04-18T00:00:02.000Z"],
    );

    await db.query(
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
      ["Image A", 0.8, 1, 0.4, 0.5, "2026-04-18T00:00:02.000Z"],
    );

    expect(
      (
        await db.query(
          `
            SELECT *
            FROM personal_image_state
            WHERE user_id = $1
            ORDER BY rating DESC, image_id ASC
          `,
          ["user-1"],
        )
      ).rows[0],
    ).toMatchObject({
      image_id: "Image A",
      wins: 1,
    });

    expect(
      (
        await db.query(
          "SELECT * FROM user_state WHERE user_id = $1 LIMIT 1",
          ["user-1"],
        )
      ).rows[0],
    ).toMatchObject({
      total_votes_cast: 1,
    });

    expect(
      (
        await db.query(
          `
            SELECT *
            FROM shared_image_state
            ORDER BY rank_position ASC, aggregate_score DESC, image_id ASC
          `,
        )
      ).rows[0],
    ).toMatchObject({
      image_id: "Image A",
      rank_position: 1,
    });

    await db.query("DELETE FROM shared_image_state");
    expect(
      (
        await db.query(
          `
            SELECT *
            FROM shared_image_state
            ORDER BY rank_position ASC, aggregate_score DESC, image_id ASC
          `,
        )
      ).rows,
    ).toEqual([]);
  });
});
