/**
 * One-off copy of the old SQLite data into Postgres. Safe to re-run: existing rows are left alone.
 *
 *   SQLITE_PATH=./database/timezone.db DATABASE_URL=postgres://... node scripts/migrate-sqlite-to-postgres.js
 *
 * Once production has been migrated, this script and the sqlite3 dependency can be deleted.
 */
require('dotenv').config();
const path = require('path');
const sqlite3 = require('sqlite3');
const database = require('../config/database');

const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '../database/timezone.db');

// SQLite stored CURRENT_TIMESTAMP as 'YYYY-MM-DD HH:MM:SS' in UTC
const toUtc = (value) => (value ? new Date(`${value.replace(' ', 'T')}Z`) : null);

function readAll(db, sql) {
    return new Promise((resolve, reject) => db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows))));
}

(async () => {
    const sqlite = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY);
    try {
        const users = await readAll(sqlite, 'SELECT * FROM users');
        const links = await readAll(sqlite, 'SELECT * FROM user_servers');
        console.log(`Read ${users.length} users and ${links.length} server links from ${sqlitePath}`);

        await database.connect();

        const counts = await database.transaction(async () => {
            let usersInserted = 0;
            let linksInserted = 0;

            for (const u of users) {
                const { changes } = await database.run(
                    `INSERT INTO users (user_id, timezone_identifier, created_at, deletion_date)
                     VALUES ($1, $2, COALESCE($3, now()), $4)
                     ON CONFLICT (user_id) DO NOTHING`,
                    [u.user_id, u.timezone_identifier, toUtc(u.created_at), toUtc(u.deletion_date)]
                );
                usersInserted += changes;
            }

            for (const l of links) {
                const { changes } = await database.run(
                    `INSERT INTO user_servers (user_id, server_id, joined_at)
                     SELECT $1, $2, COALESCE($3, now())
                     WHERE EXISTS (SELECT 1 FROM users WHERE user_id = $1)
                     ON CONFLICT DO NOTHING`,
                    [l.user_id, l.server_id, toUtc(l.joined_at)]
                );
                linksInserted += changes;
            }

            return { usersInserted, linksInserted };
        });

        console.log(`✅ Inserted ${counts.usersInserted} users and ${counts.linksInserted} server links`);
    } catch (error) {
        console.error('❌ Migration failed (nothing was written):', error);
        process.exitCode = 1;
    } finally {
        sqlite.close();
        await database.close();
    }
})();
