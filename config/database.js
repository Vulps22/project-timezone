const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
const migrations = require('./migrations');

// Arbitrary constant so only one shard runs migrations at a time
const MIGRATION_LOCK_ID = 7_462_231;

class Database {
    constructor() {
        this.pool = null;
        // Carries the transaction's client through async calls, so services can
        // call run/get/all without passing a client around
        this.transactionContext = new AsyncLocalStorage();
    }

    /**
     * Connection settings come from DATABASE_URL, or the standard PG* variables
     * (PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT) that `pg` reads itself.
     */
    buildPoolConfig() {
        const config = {
            max: Number(process.env.DATABASE_POOL_SIZE) || 5,
        };
        if (process.env.DATABASE_URL) config.connectionString = process.env.DATABASE_URL;
        if (process.env.DATABASE_SSL === 'true') {
            config.ssl = { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' };
        }
        return config;
    }

    async connect() {
        this.pool = new Pool(this.buildPoolConfig());
        this.pool.on('error', (err) => console.error('Unexpected Postgres pool error:', err.message));

        await this.pool.query('SELECT 1');
        console.log('Connected to Postgres');

        await this.migrate();
    }

    async migrate() {
        const client = await this.pool.connect();
        try {
            // Every shard connects at startup; the lock stops them racing each other
            await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
            for (const sql of migrations) {
                await client.query(sql);
            }
            console.log('Database schema is up to date');
        } finally {
            await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
            client.release();
        }
    }

    /** The transaction's client when inside `transaction()`, otherwise the pool */
    get executor() {
        return this.transactionContext.getStore() ?? this.pool;
    }

    /** @returns {Promise<{changes: number}>} */
    async run(sql, params = []) {
        const result = await this.executor.query(sql, params);
        return { changes: result.rowCount };
    }

    async get(sql, params = []) {
        const result = await this.executor.query(sql, params);
        return result.rows[0];
    }

    async all(sql, params = []) {
        const result = await this.executor.query(sql, params);
        return result.rows;
    }

    /**
     * Run the callback inside a transaction, rolling back if it throws.
     * @param {() => Promise<T>} work
     * @returns {Promise<T>}
     * @template T
     */
    async transaction(work) {
        if (this.transactionContext.getStore()) return work(); // already in one

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await this.transactionContext.run(client, work);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async close() {
        if (!this.pool) return;
        await this.pool.end();
        this.pool = null;
        console.log('Database connection closed');
    }
}

module.exports = new Database();
module.exports.Database = Database;
