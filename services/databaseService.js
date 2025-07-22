const database = require('../config/database');

class DatabaseService {
    /**
     * Get user's timezone information
     * @param {string} userId - Discord user ID
     * @returns {Promise<Object|null>} User timezone data or null if not found
     */
    async getUserTimezone(userId) {
        return new Promise((resolve, reject) => {
            const db = database.getDatabase();
            const sql = 'SELECT * FROM users WHERE user_id = ?';
            
            db.get(sql, [userId], (err, row) => {
                if (err) {
                    console.error('Error getting user timezone:', err);
                    reject(err);
                } else {
                    resolve(row || null);
                }
            });
        });
    }

    /**
     * Set or update user's timezone
     * @param {string} userId - Discord user ID
     * @param {string} timezoneIdentifier - Timezone identifier (e.g., 'America/New_York')
     * @returns {Promise<boolean>} Success status
     */
    async setUserTimezone(userId, timezoneIdentifier) {
        return new Promise((resolve, reject) => {
            const db = database.getDatabase();
            const sql = `
                INSERT OR REPLACE INTO users (user_id, timezone_identifier, created_at) 
                VALUES (?, ?, CASE WHEN EXISTS(SELECT 1 FROM users WHERE user_id = ?) 
                                  THEN (SELECT created_at FROM users WHERE user_id = ?)
                                  ELSE CURRENT_TIMESTAMP END)
            `;
            
            db.run(sql, [userId, timezoneIdentifier, userId, userId], function(err) {
                if (err) {
                    console.error('Error setting user timezone:', err);
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    /**
     * Delete user's timezone data (GDPR compliance)
     * @param {string} userId - Discord user ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteUser(userId) {
        return new Promise((resolve, reject) => {
            const db = database.getDatabase();
            
            // Start transaction
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Delete user-server associations
                db.run('DELETE FROM user_servers WHERE user_id = ?', [userId], (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }
                    
                    // Delete user
                    db.run('DELETE FROM users WHERE user_id = ?', [userId], (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                        } else {
                            db.run('COMMIT');
                            resolve(true);
                        }
                    });
                });
            });
        });
    }

    /**
     * Add or update user-server association
     * @param {string} userId - Discord user ID
     * @param {string} serverId - Discord server ID
     * @returns {Promise<boolean>} Success status
     */
    async addUserToServer(userId, serverId) {
        return new Promise((resolve, reject) => {
            const db = database.getDatabase();
            const sql = `
                INSERT OR REPLACE INTO user_servers (user_id, server_id, joined_at)
                VALUES (?, ?, CASE WHEN EXISTS(SELECT 1 FROM user_servers WHERE user_id = ? AND server_id = ?)
                                  THEN (SELECT joined_at FROM user_servers WHERE user_id = ? AND server_id = ?)
                                  ELSE CURRENT_TIMESTAMP END)
            `;
            
            db.run(sql, [userId, serverId, userId, serverId, userId, serverId], function(err) {
                if (err) {
                    console.error('Error adding user to server:', err);
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    /**
     * Get all servers where a user has the bot
     * @param {string} userId - Discord user ID
     * @returns {Promise<Array>} Array of server IDs
     */
    async getUserServers(userId) {
        return new Promise((resolve, reject) => {
            const db = database.getDatabase();
            const sql = 'SELECT server_id FROM user_servers WHERE user_id = ?';
            
            db.all(sql, [userId], (err, rows) => {
                if (err) {
                    console.error('Error getting user servers:', err);
                    reject(err);
                } else {
                    resolve(rows.map(row => row.server_id));
                }
            });
        });
    }

    /**
     * Get all users in a specific timezone
     * @param {string} timezoneIdentifier - Timezone identifier
     * @returns {Promise<Array>} Array of user IDs
     */
    async getUsersInTimezone(timezoneIdentifier) {
        return new Promise((resolve, reject) => {
            const db = database.getDatabase();
            const sql = 'SELECT user_id FROM users WHERE timezone_identifier = ?';
            
            db.all(sql, [timezoneIdentifier], (err, rows) => {
                if (err) {
                    console.error('Error getting users in timezone:', err);
                    reject(err);
                } else {
                    resolve(rows.map(row => row.user_id));
                }
            });
        });
    }

    /**
     * Get statistics about timezone usage
     * @returns {Promise<Object>} Usage statistics
     */
    async getStats() {
        return new Promise((resolve, reject) => {
            const db = database.getDatabase();
            
            db.serialize(() => {
                const stats = {};
                
                // Total users
                db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    stats.totalUsers = row.count;
                    
                    // Total user-server connections
                    db.get('SELECT COUNT(*) as count FROM user_servers', [], (err, row) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        stats.totalConnections = row.count;
                        
                        // Most popular timezones
                        db.all(`
                            SELECT timezone_identifier, COUNT(*) as count 
                            FROM users 
                            GROUP BY timezone_identifier 
                            ORDER BY count DESC 
                            LIMIT 10
                        `, [], (err, rows) => {
                            if (err) {
                                reject(err);
                            } else {
                                stats.popularTimezones = rows;
                                resolve(stats);
                            }
                        });
                    });
                });
            });
        });
    }
}

module.exports = new DatabaseService();
