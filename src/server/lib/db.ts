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

export type DatabaseLike = DbClient;

function createPgClient(
  queryable: Pick<Pool, "query"> | Pick<PoolClient, "query">,
): DbClient {
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
  runtimeDb ??= createPostgresDb(env.databaseUrl);
  return runtimeDb;
}

export function toDbClient(input: DatabaseLike): DbClient {
  return input;
}
