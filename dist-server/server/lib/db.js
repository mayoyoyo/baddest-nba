import { Pool } from "pg";
function createPgClient(queryable) {
    const client = {
        async query(sql, params = []) {
            const result = await queryable.query(sql, params);
            return {
                rows: result.rows,
                rowCount: result.rowCount ?? 0,
            };
        },
        async transaction(work) {
            return work(client);
        },
    };
    return client;
}
function createPgTransactionClient(client) {
    const tx = {
        async query(sql, params = []) {
            const result = await client.query(sql, params);
            return {
                rows: result.rows,
                rowCount: result.rowCount ?? 0,
            };
        },
        async transaction(work) {
            await client.query("SAVEPOINT nested_tx");
            try {
                const result = await work(tx);
                await client.query("RELEASE SAVEPOINT nested_tx");
                return result;
            }
            catch (error) {
                await client.query("ROLLBACK TO SAVEPOINT nested_tx");
                throw error;
            }
        },
    };
    return tx;
}
function createPostgresDbFromPool(pool) {
    const db = createPgClient(pool);
    return {
        ...db,
        async transaction(work) {
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                const tx = createPgTransactionClient(client);
                const result = await work(tx);
                await client.query("COMMIT");
                return result;
            }
            catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
            finally {
                client.release();
            }
        },
    };
}
let runtimeDb = null;
export function createPostgresDb(connectionString) {
    const pool = new Pool({
        connectionString,
        max: 5,
        ssl: { rejectUnauthorized: false },
    });
    return createPostgresDbFromPool(pool);
}
export function getRuntimeDb(env) {
    runtimeDb ??= createPostgresDb(env.databaseUrl);
    return runtimeDb;
}
export function toDbClient(input) {
    return input;
}
