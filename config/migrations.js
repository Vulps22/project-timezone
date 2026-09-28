/**
 * Schema migrations, run in order on every startup. Each must be idempotent.
 * Append new statements to the end; never edit ones that have already shipped.
 */
module.exports = [
    `CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        timezone_identifier TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deletion_date TIMESTAMPTZ
    )`,

    `CREATE TABLE IF NOT EXISTS user_servers (
        user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        server_id TEXT NOT NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, server_id)
    )`,

    'CREATE INDEX IF NOT EXISTS idx_user_servers_server ON user_servers (server_id)',
    'CREATE INDEX IF NOT EXISTS idx_users_timezone ON users (timezone_identifier)',
    'CREATE INDEX IF NOT EXISTS idx_users_deletion_date ON users (deletion_date) WHERE deletion_date IS NOT NULL',
];
