/**
 * Permanently delete users whose deletion_date has passed.
 * Safe to run while the bot is up (SQLite WAL). Intended for cron, e.g. daily at 03:17:
 *
 *   17 3 * * * cd /app && node scripts/purge-expired-users.js
 */
require('dotenv').config();
const database = require('../config/database');
const databaseService = require('../services/databaseService');

(async () => {
    try {
        await database.connect();
        const deleted = await databaseService.purgeExpiredUsers();
        console.log(`🧹 Purged ${deleted} expired user(s)`);
        await database.close();
    } catch (error) {
        console.error('❌ Purge failed:', error);
        process.exitCode = 1;
    }
})();
