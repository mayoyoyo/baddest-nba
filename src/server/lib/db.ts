import { createClient } from "@supabase/supabase-js";
import { Pool, type PoolClient } from "pg";
import type { ServerEnv } from "./env.js";

export interface DbQueryResult<T> {
  rowCount: number;
  rows: T[];
}

export interface DbClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<DbQueryResult<T>>;
  transaction<T>(work: (db: DbClient) => Promise<T>): Promise<T>;
}

export type DatabaseLike = DbClient | D1DatabaseLike;

type DataApiRow = Record<string, unknown>;

export interface DataApiFilter {
  column: string;
  op: "eq" | "not-null";
  value?: unknown;
}

export interface DataApiOrder {
  column: string;
  ascending: boolean;
}

export interface DataApiSelectOptions {
  filters?: DataApiFilter[];
  limit?: number;
  orderBy?: DataApiOrder[];
}

export interface DataApiAdapter {
  count(table: string, filters?: DataApiFilter[]): Promise<number>;
  delete(table: string, filters?: DataApiFilter[]): Promise<number>;
  insert(table: string, row: DataApiRow): Promise<void>;
  select<T extends DataApiRow>(
    table: string,
    options?: DataApiSelectOptions,
  ): Promise<T[]>;
  upsert(
    table: string,
    row: DataApiRow,
    conflictColumns: string[],
  ): Promise<void>;
}

interface D1StatementResult<T> {
  results?: T[];
  success?: boolean;
  meta?: {
    changes?: number;
  };
}

interface D1PreparedStatementLike {
  all<T>(): Promise<D1StatementResult<T>>;
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T>(): Promise<T | null>;
  run(): Promise<D1StatementResult<never>>;
}

interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
}

function isReadQuery(sql: string): boolean {
  const normalized = sql.trim().toLowerCase();
  return (
    normalized.startsWith("select") ||
    normalized.startsWith("with") ||
    normalized.startsWith("show") ||
    normalized.startsWith("pragma")
  );
}

export function normalizeSqlForD1(sql: string): string {
  return sql.replace(/\$\d+\b/g, "?");
}

function createD1Db(db: D1DatabaseLike): DbClient {
  return {
    async query<T>(sql: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
      const statement = db.prepare(normalizeSqlForD1(sql)).bind(...params);

      if (isReadQuery(sql)) {
        const result = await statement.all<T>();
        const rows = result.results ?? [];
        return {
          rows,
          rowCount: rows.length,
        };
      }

      const result = await statement.run();
      return {
        rows: [],
        rowCount: result.meta?.changes ?? 0,
      };
    },

    async transaction<T>(work: (tx: DbClient) => Promise<T>): Promise<T> {
      return work(createD1Db(db));
    },
  };
}

function createPgClient(queryable: Pick<Pool, "query"> | Pick<PoolClient, "query">): DbClient {
  const client: DbClient = {
    async query<T>(sql: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
      const result = await queryable.query(sql, params);
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? 0,
      };
    },

    async transaction<T>(work: (tx: DbClient) => Promise<T>): Promise<T> {
      return work(client);
    },
  };

  return client;
}

function createPgTransactionClient(client: PoolClient): DbClient {
  const tx: DbClient = {
    async query<T>(sql: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
      const result = await client.query(sql, params);
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? 0,
      };
    },

    async transaction<T>(work: (nested: DbClient) => Promise<T>): Promise<T> {
      await client.query("SAVEPOINT nested_tx");
      try {
        const result = await work(tx);
        await client.query("RELEASE SAVEPOINT nested_tx");
        return result;
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT nested_tx");
        throw error;
      }
    },
  };

  return tx;
}

function createPostgresDbFromPool(pool: Pool): DbClient {
  const db = createPgClient(pool);

  return {
    ...db,
    async transaction<T>(work: (tx: DbClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx = createPgTransactionClient(client);
        const result = await work(tx);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function requireParams(sql: string, params: unknown[], count: number): void {
  if (params.length !== count) {
    throw new Error(`Expected ${count} params for query: ${sql}`);
  }
}

function rowResult<T>(rows: T[]): DbQueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
  };
}

function writeResult(rowCount = 1): DbQueryResult<never> {
  return {
    rows: [],
    rowCount,
  };
}

function unsupportedQuery(sql: string): never {
  throw new Error(`Unsupported runtime SQL query: ${sql}`);
}

function createSupabaseDataApiAdapter(env: ServerEnv): DataApiAdapter {
  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  function applyFilters<TQuery extends {
    eq: (column: string, value: unknown) => TQuery;
    not: (column: string, operator: string, value: unknown) => TQuery;
  }>(query: TQuery, filters: DataApiFilter[] = []): TQuery {
    let next = query;

    for (const filter of filters) {
      if (filter.op === "eq") {
        next = next.eq(filter.column, filter.value);
        continue;
      }

      if (filter.op === "not-null") {
        next = next.not(filter.column, "is", null);
        continue;
      }

      throw new Error(`Unsupported data api filter: ${filter.op}`);
    }

    return next;
  }

  return {
    async count(table, filters = []) {
      let query = supabase.from(table).select("*", { count: "exact", head: true });
      query = applyFilters(query, filters);
      const { count, error } = await query;
      if (error) {
        throw new Error(error.message);
      }
      return count ?? 0;
    },

    async delete(table, filters = []) {
      const rowCount = await this.count(table, filters);
      let query = supabase.from(table).delete();
      query = applyFilters(query, filters);
      const { error } = await query;
      if (error) {
        throw new Error(error.message);
      }
      return rowCount;
    },

    async insert(table, row) {
      const { error } = await supabase.from(table).insert(row);
      if (error) {
        throw new Error(error.message);
      }
    },

    async select<T extends DataApiRow>(
      table: string,
      options: DataApiSelectOptions = {},
    ): Promise<T[]> {
      let query = supabase.from(table).select("*");
      query = applyFilters(query, options.filters);

      for (const order of options.orderBy ?? []) {
        query = query.order(order.column, { ascending: order.ascending });
      }

      if (typeof options.limit === "number") {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(error.message);
      }
      return (data ?? []) as T[];
    },

    async upsert(table, row, conflictColumns) {
      const { error } = await supabase.from(table).upsert(row, {
        onConflict: conflictColumns.join(","),
      });
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

export function createDataApiDb(adapter: DataApiAdapter): DbClient {
  return {
    async query<T>(sql: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
      const normalized = normalizeSql(sql);

      if (normalized.startsWith("insert into users ")) {
        requireParams(sql, params, 8);
        await adapter.insert("users", {
          id: params[0],
          username: params[1],
          pin_hash: params[2],
          role: params[3],
          created_at: params[4],
          last_active_at: params[5],
          failed_login_count: params[6],
          locked_until: params[7],
        });
        return writeResult();
      }

      if (normalized.startsWith("insert into sessions ")) {
        requireParams(sql, params, 7);
        await adapter.insert("sessions", {
          id: params[0],
          user_id: params[1],
          token_hash: params[2],
          created_at: params[3],
          expires_at: params[4],
          last_seen_at: params[5],
          ip_hash: params[6],
        });
        return writeResult();
      }

      if (normalized === "select * from users where id = $1 limit 1") {
        requireParams(sql, params, 1);
        return rowResult(
          await adapter.select<T & DataApiRow>("users", {
            filters: [{ column: "id", op: "eq", value: params[0] }],
            limit: 1,
          }),
        );
      }

      if (normalized === "select * from users where username = $1 limit 1") {
        requireParams(sql, params, 1);
        return rowResult(
          await adapter.select<T & DataApiRow>("users", {
            filters: [{ column: "username", op: "eq", value: params[0] }],
            limit: 1,
          }),
        );
      }

      if (normalized === "select * from users order by username asc") {
        return rowResult(
          await adapter.select<T & DataApiRow>("users", {
            orderBy: [{ column: "username", ascending: true }],
          }),
        );
      }

      if (normalized === "select * from sessions where token_hash = $1 limit 1") {
        requireParams(sql, params, 1);
        return rowResult(
          await adapter.select<T & DataApiRow>("sessions", {
            filters: [{ column: "token_hash", op: "eq", value: params[0] }],
            limit: 1,
          }),
        );
      }

      if (normalized === "delete from sessions where token_hash = $1") {
        requireParams(sql, params, 1);
        return writeResult(
          await adapter.delete("sessions", [
            { column: "token_hash", op: "eq", value: params[0] },
          ]),
        );
      }

      if (normalized.startsWith("insert into images ")) {
        requireParams(sql, params, 10);
        await adapter.insert("images", {
          id: params[0],
          r2_key_original: params[1],
          r2_key_display: params[2],
          width: params[3],
          height: params[4],
          mime_type: params[5],
          sort_order: params[6],
          status: params[7],
          uploaded_by: params[8],
          created_at: params[9],
        });
        return writeResult();
      }

      if (
        normalized ===
        "select coalesce(max(sort_order), -1) + 1 as next_sort_order from images"
      ) {
        const rows = await adapter.select<{ sort_order: number }>("images", {
          orderBy: [{ column: "sort_order", ascending: false }],
          limit: 1,
        });
        const maxSortOrder =
          typeof rows[0]?.sort_order === "number" ? rows[0].sort_order : -1;
        return rowResult([{ next_sort_order: maxSortOrder + 1 } as T]);
      }

      if (
        normalized ===
        "select * from images where status = 'active' order by sort_order asc, created_at asc"
      ) {
        return rowResult(
          await adapter.select<T & DataApiRow>("images", {
            filters: [{ column: "status", op: "eq", value: "active" }],
            orderBy: [
              { column: "sort_order", ascending: true },
              { column: "created_at", ascending: true },
            ],
          }),
        );
      }

      if (normalized === "select * from images order by id asc") {
        return rowResult(
          await adapter.select<T & DataApiRow>("images", {
            orderBy: [{ column: "id", ascending: true }],
          }),
        );
      }

      if (normalized === "select * from images where id = $1 limit 1") {
        requireParams(sql, params, 1);
        return rowResult(
          await adapter.select<T & DataApiRow>("images", {
            filters: [{ column: "id", op: "eq", value: params[0] }],
            limit: 1,
          }),
        );
      }

      if (normalized === "delete from images where id = $1") {
        requireParams(sql, params, 1);
        return writeResult(
          await adapter.delete("images", [
            { column: "id", op: "eq", value: params[0] },
          ]),
        );
      }

      if (
        normalized ===
        "update images set r2_key_original = $1, r2_key_display = $2, width = $3, height = $4, mime_type = $5, uploaded_by = $6 where id = $7"
      ) {
        requireParams(sql, params, 7);
        const existingRows = await adapter.select<DataApiRow>("images", {
          filters: [{ column: "id", op: "eq", value: params[6] }],
          limit: 1,
        });
        const existing = existingRows[0];

        if (!existing) {
          return writeResult(0);
        }

        await adapter.upsert(
          "images",
          {
            ...existing,
            r2_key_original: params[0],
            r2_key_display: params[1],
            width: params[2],
            height: params[3],
            mime_type: params[4],
            uploaded_by: params[5],
          },
          ["id"],
        );
        return writeResult();
      }

      if (
        normalized ===
        "select * from personal_image_state where user_id = $1 order by rating desc, image_id asc"
      ) {
        requireParams(sql, params, 1);
        return rowResult(
          await adapter.select<T & DataApiRow>("personal_image_state", {
            filters: [{ column: "user_id", op: "eq", value: params[0] }],
            orderBy: [
              { column: "rating", ascending: false },
              { column: "image_id", ascending: true },
            ],
          }),
        );
      }

      if (
        normalized ===
        "select * from shared_image_state order by rank_position asc, aggregate_score desc, image_id asc"
      ) {
        return rowResult(
          await adapter.select<T & DataApiRow>("shared_image_state", {
            orderBy: [
              { column: "rank_position", ascending: true },
              { column: "aggregate_score", ascending: false },
              { column: "image_id", ascending: true },
            ],
          }),
        );
      }

      if (
        normalized ===
        "select * from personal_image_state order by user_id asc, image_id asc"
      ) {
        return rowResult(
          await adapter.select<T & DataApiRow>("personal_image_state", {
            orderBy: [
              { column: "user_id", ascending: true },
              { column: "image_id", ascending: true },
            ],
          }),
        );
      }

      if (normalized === "select * from user_state order by user_id asc") {
        return rowResult(
          await adapter.select<T & DataApiRow>("user_state", {
            orderBy: [{ column: "user_id", ascending: true }],
          }),
        );
      }

      if (normalized === "select * from user_state where user_id = $1 limit 1") {
        requireParams(sql, params, 1);
        return rowResult(
          await adapter.select<T & DataApiRow>("user_state", {
            filters: [{ column: "user_id", op: "eq", value: params[0] }],
            limit: 1,
          }),
        );
      }

      if (normalized.startsWith("insert into personal_image_state ")) {
        requireParams(sql, params, 8);
        await adapter.upsert(
          "personal_image_state",
          {
            user_id: params[0],
            image_id: params[1],
            rating: params[2],
            comparisons: params[3],
            wins: params[4],
            losses: params[5],
            confidence: params[6],
            last_compared_at: params[7],
          },
          ["user_id", "image_id"],
        );
        return writeResult();
      }

      if (normalized === "delete from personal_image_state where image_id = $1") {
        requireParams(sql, params, 1);
        return writeResult(
          await adapter.delete("personal_image_state", [
            { column: "image_id", op: "eq", value: params[0] },
          ]),
        );
      }

      if (normalized.startsWith("insert into user_state ")) {
        requireParams(sql, params, 5);
        await adapter.upsert(
          "user_state",
          {
            user_id: params[0],
            total_votes_cast: params[1],
            ranking_confidence: params[2],
            recent_pair_cache: params[3],
            updated_at: params[4],
          },
          ["user_id"],
        );
        return writeResult();
      }

      if (normalized === "delete from shared_image_state") {
        return writeResult(await adapter.delete("shared_image_state"));
      }

      if (normalized === "delete from shared_image_state where image_id = $1") {
        requireParams(sql, params, 1);
        return writeResult(
          await adapter.delete("shared_image_state", [
            { column: "image_id", op: "eq", value: params[0] },
          ]),
        );
      }

      if (normalized.startsWith("insert into shared_image_state ")) {
        requireParams(sql, params, 6);
        await adapter.insert("shared_image_state", {
          image_id: params[0],
          aggregate_score: params[1],
          rank_position: params[2],
          effective_voter_weight: params[3],
          confidence: params[4],
          updated_at: params[5],
        });
        return writeResult();
      }

      if (
        normalized ===
        "select count(*) as total_votes_cast from vote_events where user_id = $1"
      ) {
        requireParams(sql, params, 1);
        const count = await adapter.count("vote_events", [
          { column: "user_id", op: "eq", value: params[0] },
        ]);
        return rowResult([{ total_votes_cast: count } as T]);
      }

      if (normalized === "select * from vote_events where id = $1 limit 1") {
        requireParams(sql, params, 1);
        return rowResult(
          await adapter.select<T & DataApiRow>("vote_events", {
            filters: [{ column: "id", op: "eq", value: params[0] }],
            limit: 1,
          }),
        );
      }

      if (normalized.startsWith("insert into vote_events ")) {
        requireParams(sql, params, 6);
        await adapter.insert("vote_events", {
          id: params[0],
          user_id: params[1],
          winner_image_id: params[2],
          loser_image_id: params[3],
          context: params[4],
          created_at: params[5],
        });
        return writeResult();
      }

      if (normalized === "select * from auth_attempts where key = $1 limit 1") {
        requireParams(sql, params, 1);
        return rowResult(
          await adapter.select<T & DataApiRow>("auth_attempts", {
            filters: [{ column: "key", op: "eq", value: params[0] }],
            limit: 1,
          }),
        );
      }

      if (normalized.startsWith("insert into auth_attempts ")) {
        requireParams(sql, params, 4);
        await adapter.upsert(
          "auth_attempts",
          {
            key: params[0],
            attempts: params[1],
            window_started_at: params[2],
            blocked_until: params[3],
          },
          ["key"],
        );
        return writeResult();
      }

      if (normalized === "delete from auth_attempts where key = $1") {
        requireParams(sql, params, 1);
        return writeResult(
          await adapter.delete("auth_attempts", [
            { column: "key", op: "eq", value: params[0] },
          ]),
        );
      }

      return unsupportedQuery(sql);
    },

    async transaction<T>(work: (tx: DbClient) => Promise<T>): Promise<T> {
      return work(this);
    },
  };
}

let runtimeDb: DbClient | null = null;

export function createPostgresDb(connectionString: string): DbClient {
  const pool = new Pool({
    connectionString,
    max: 5,
    ssl: { rejectUnauthorized: false },
  });

  return createPostgresDbFromPool(pool);
}

export function getRuntimeDb(env: ServerEnv): DbClient {
  runtimeDb ??= createDataApiDb(createSupabaseDataApiAdapter(env));
  return runtimeDb;
}

export function isD1Database(value: unknown): value is D1DatabaseLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "prepare" in value &&
    typeof (value as D1DatabaseLike).prepare === "function"
  );
}

export function toDbClient(input: DatabaseLike): DbClient {
  return isD1Database(input) ? createD1Db(input) : input;
}
