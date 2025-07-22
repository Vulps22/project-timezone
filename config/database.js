const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, '../database/timezone.db');
    }

    async connect() {
        return new Promise((resolve, reject) => {
            // Ensure database directory exists
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // Configure SQLite for WAL mode to handle concurrent access from multiple shards
            this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
                if (err) {
                    console.error('Error opening database:', err.message);
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    
                    // Enable WAL mode for better concurrent access
                    this.db.run('PRAGMA journal_mode = WAL;', (walErr) => {
                        if (walErr) {
                            console.warn('Could not enable WAL mode:', walErr.message);
                        } else {
                            console.log('SQLite WAL mode enabled for shard safety');
                        }
                    });
                    
                    // Enable foreign keys
                    this.db.run('PRAGMA foreign_keys = ON;');
                    
                    this.initializeTables()
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    }

    async initializeTables() {
        return new Promise((resolve, reject) => {
            const tables = [
                // Users table
                `CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    timezone_identifier TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                
                // User-Server associations
                `CREATE TABLE IF NOT EXISTS user_servers (
                    user_id TEXT,
                    server_id TEXT,
                    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, server_id),
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                )`,
                
                // DST Schedule cache
                `CREATE TABLE IF NOT EXISTS dst_schedule (
                    timezone TEXT PRIMARY KEY,
                    next_change_date DATETIME,
                    next_offset INTEGER,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`
            ];

            let completedTables = 0;
            const totalTables = tables.length;

            tables.forEach((sql, index) => {
                this.db.run(sql, (err) => {
                    if (err) {
                        console.error(`Error creating table ${index + 1}:`, err.message);
                        reject(err);
                        return;
                    }
                    
                    completedTables++;
                    if (completedTables === totalTables) {
                        console.log('All database tables initialized successfully');
                        resolve();
                    }
                });
            });
        });
    }

    async close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err.message);
                    } else {
                        console.log('Database connection closed');
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    getDatabase() {
        return this.db;
    }
}

module.exports = new Database();
