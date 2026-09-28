const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DEFAULT_PATH = path.join(__dirname, '../database/timezone.db');

class Database {
    constructor(dbPath = process.env.DATABASE_PATH || DEFAULT_PATH) {
        this.db = null;
        this.dbPath = dbPath;
        this.transactionQueue = Promise.resolve();
    }

    async connect() {
        if (this.dbPath !== ':memory:') {
            fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
        }

        this.db = await new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
                if (err) {
                    console.error('Error opening database:', err.message);
                    reject(err);
                } else {
                    resolve(db);
                }
            });
        });
        console.log('Connected to SQLite database');

        // WAL lets the shard processes share the file safely
        await this.run('PRAGMA journal_mode = WAL;').catch(err => console.warn('Could not enable WAL mode:', err.message));
        await this.run('PRAGMA foreign_keys = ON;');
        await this.initializeTables();
    }

    async initializeTables() {
        await this.run(`CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            timezone_identifier TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deletion_date DATETIME
        )`);

        await this.run(`CREATE TABLE IF NOT EXISTS user_servers (
            user_id TEXT,
            server_id TEXT,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, server_id),
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        )`);

        await this.run('CREATE INDEX IF NOT EXISTS idx_user_servers_server ON user_servers(server_id)');

        // Migrations for databases created before a column existed
        await this.addColumnIfMissing('users', 'deletion_date', 'DATETIME');

        console.log('All database tables initialized successfully');
    }

    async addColumnIfMissing(table, column, type) {
        const columns = await this.all(`PRAGMA table_info(${table})`);
        if (!columns.some(c => c.name === column)) {
            await this.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
            console.log(`Added column ${table}.${column}`);
        }
    }

    /** @returns {Promise<{changes: number, lastID: number}>} */
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes, lastID: this.lastID });
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
        });
    }

    /**
     * Run the callback inside a transaction, rolling back if it throws.
     * Transactions are queued because they all share one connection and SQLite
     * can't nest them.
     * @param {() => Promise<T>} work
     * @returns {Promise<T>}
     * @template T
     */
    transaction(work) {
        const result = this.transactionQueue.then(() => this.runTransaction(work));
        this.transactionQueue = result.catch(() => {});
        return result;
    }

    async runTransaction(work) {
        await this.run('BEGIN IMMEDIATE');
        try {
            const result = await work();
            await this.run('COMMIT');
            return result;
        } catch (error) {
            await this.run('ROLLBACK').catch(() => {});
            throw error;
        }
    }

    async close() {
        if (!this.db) return;
        await new Promise((resolve) => {
            this.db.close((err) => {
                if (err) console.error('Error closing database:', err.message);
                else console.log('Database connection closed');
                resolve();
            });
        });
        this.db = null;
    }

    getDatabase() {
        return this.db;
    }
}

module.exports = new Database();
module.exports.Database = Database;
