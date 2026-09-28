const database = require('../config/database');

// How long a user's data is kept after the bot leaves their last known server
const RETENTION_PERIOD = '+6 months';

class DatabaseService {
    /**
     * Get user's timezone information
     * @param {string} userId - Discord user ID
     * @returns {Promise<Object|null>} User timezone data or null if not found
     */
    async getUserTimezone(userId) {
        const row = await database.get('SELECT * FROM users WHERE user_id = ?', [userId]);
        return row || null;
    }

    /**
     * Set or update user's timezone.
     * Uses an upsert rather than INSERT OR REPLACE: REPLACE deletes the old row,
     * which cascades and wipes every user_servers row for the user.
     * @param {string} userId - Discord user ID
     * @param {string} timezoneIdentifier - Timezone identifier (e.g., 'America/New_York')
     * @returns {Promise<boolean>} Success status
     */
    async setUserTimezone(userId, timezoneIdentifier) {
        await database.run(
            `INSERT INTO users (user_id, timezone_identifier) VALUES (?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
                timezone_identifier = excluded.timezone_identifier,
                deletion_date = NULL`,
            [userId, timezoneIdentifier]
        );
        return true;
    }

    /**
     * Delete user's timezone data (GDPR compliance)
     * @param {string} userId - Discord user ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteUser(userId) {
        await database.transaction(async () => {
            await database.run('DELETE FROM user_servers WHERE user_id = ?', [userId]);
            await database.run('DELETE FROM users WHERE user_id = ?', [userId]);
        });
        return true;
    }

    /**
     * Link a user to a server. Seeing the user in a server again cancels any pending deletion.
     * @param {string} userId - Discord user ID
     * @param {string} serverId - Discord server ID
     * @returns {Promise<boolean>} Success status
     */
    async addUserToServer(userId, serverId) {
        await database.transaction(async () => {
            await database.run(
                'INSERT OR IGNORE INTO user_servers (user_id, server_id) VALUES (?, ?)',
                [userId, serverId]
            );
            await database.run('UPDATE users SET deletion_date = NULL WHERE user_id = ?', [userId]);
        });
        return true;
    }

    /**
     * Get all servers where a user has the bot
     * @param {string} userId - Discord user ID
     * @returns {Promise<Array>} Array of server IDs
     */
    async getUserServers(userId) {
        const rows = await database.all('SELECT server_id FROM user_servers WHERE user_id = ?', [userId]);
        return rows.map(row => row.server_id);
    }

    /**
     * Forget a server the bot was removed from. Users left with no servers
     * are scheduled for deletion after the retention period.
     * @param {string} serverId - Discord server ID
     * @returns {Promise<{linksRemoved: number, usersScheduled: number}>}
     */
    async removeServer(serverId) {
        return database.transaction(async () => {
            const affected = await database.all('SELECT user_id FROM user_servers WHERE server_id = ?', [serverId]);
            const { changes: linksRemoved } = await database.run('DELETE FROM user_servers WHERE server_id = ?', [serverId]);

            let usersScheduled = 0;
            for (const { user_id: userId } of affected) {
                const { changes } = await database.run(
                    `UPDATE users SET deletion_date = datetime('now', ?)
                     WHERE user_id = ?
                       AND deletion_date IS NULL
                       AND NOT EXISTS (SELECT 1 FROM user_servers WHERE user_id = users.user_id)`,
                    [RETENTION_PERIOD, userId]
                );
                usersScheduled += changes;
            }

            return { linksRemoved, usersScheduled };
        });
    }

    /**
     * Permanently delete users whose deletion date has passed
     * @returns {Promise<number>} Number of users deleted
     */
    async purgeExpiredUsers() {
        return database.transaction(async () => {
            await database.run(
                `DELETE FROM user_servers WHERE user_id IN
                    (SELECT user_id FROM users WHERE deletion_date IS NOT NULL AND deletion_date < datetime('now'))`
            );
            const { changes } = await database.run(
                "DELETE FROM users WHERE deletion_date IS NOT NULL AND deletion_date < datetime('now')"
            );
            return changes;
        });
    }

    /**
     * Get all users in a specific timezone
     * @param {string} timezoneIdentifier - Timezone identifier
     * @returns {Promise<Array>} Array of user IDs
     */
    async getUsersInTimezone(timezoneIdentifier) {
        const rows = await database.all('SELECT user_id FROM users WHERE timezone_identifier = ?', [timezoneIdentifier]);
        return rows.map(row => row.user_id);
    }

    /**
     * Get every timezone that at least one user has set
     * @returns {Promise<string[]>} Array of timezone identifiers
     */
    async getDistinctTimezones() {
        const rows = await database.all('SELECT DISTINCT timezone_identifier FROM users');
        return rows.map(row => row.timezone_identifier);
    }

    /**
     * Get statistics about timezone usage
     * @returns {Promise<Object>} Usage statistics
     */
    async getStats() {
        const [users, connections, popularTimezones] = await Promise.all([
            database.get('SELECT COUNT(*) as count FROM users'),
            database.get('SELECT COUNT(*) as count FROM user_servers'),
            database.all(`
                SELECT timezone_identifier, COUNT(*) as count
                FROM users
                GROUP BY timezone_identifier
                ORDER BY count DESC
                LIMIT 10
            `)
        ]);

        return {
            totalUsers: users.count,
            totalConnections: connections.count,
            popularTimezones
        };
    }
}

module.exports = new DatabaseService();
