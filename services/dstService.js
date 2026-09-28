const { DateTime } = require('luxon');
const databaseService = require('./databaseService');
const timezoneService = require('./timezoneService');
const nicknameService = require('./nicknameService');
const { clientProvider } = require('./clientProvider');
const { logger } = require('../utils/logger');

class DSTService {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
    }

    /**
     * Start the DST monitoring service
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️ DST Service already running');
            return;
        }

        console.log('🌍 Starting DST monitoring service...');
        
        // Calculate milliseconds until next hour
        const now = new Date();
        const msUntilNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();
        
        console.log(`⏰ Scheduling first DST check in ${Math.round(msUntilNextHour / 1000 / 60)} minutes (at ${String(now.getHours() + 1).padStart(2, '0')}:00)`);
        
        // Set timeout for the first check at the next hour
        this.initialTimeoutId = setTimeout(() => {
            // Run the first check
            this.checkDSTChanges().catch(error => {
                console.error('❌ DST check error:', error);
            });
            
            // Then set up hourly interval (every hour on the hour)
            this.intervalId = setInterval(() => {
                this.checkDSTChanges().catch(error => {
                    console.error('❌ DST check error:', error);
                });
            }, 60 * 60 * 1000); // 1 hour
            
        }, msUntilNextHour);

        this.isRunning = true;
        console.log('✅ DST monitoring service started');
    }

    /**
     * Stop the DST monitoring service
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.initialTimeoutId) {
            clearTimeout(this.initialTimeoutId);
            this.initialTimeoutId = null;
        }
        this.isRunning = false;
        console.log('🛑 DST monitoring service stopped');
    }

    /**
     * Check for DST changes in timezones where it's currently 5am
     * @param {DateTime} [now] - Moment to check at (injectable for tests/simulation)
     */
    async checkDSTChanges(now = DateTime.now()) {
        try {
            console.log('🔍 Checking for DST changes...');

            const timezonesInUse = await databaseService.getDistinctTimezones();

            if (timezonesInUse.length === 0) {
                console.log('📭 No timezones in use, skipping DST check');
                return;
            }

            console.log(`🌍 Checking ${timezonesInUse.length} timezones for DST changes`);

            const timezonesToUpdate = [];

            for (const timezone of timezonesInUse) {
                try {
                    const dstChanged = await this.checkTimezoneForDST(timezone, now);
                    if (dstChanged) {
                        timezonesToUpdate.push(timezone);
                    }
                } catch (error) {
                    console.error(`❌ Error checking DST for ${timezone}:`, error.message);
                }
            }

            if (timezonesToUpdate.length > 0) {
                console.log(`🔄 DST changes detected in ${timezonesToUpdate.length} timezone(s):`, timezonesToUpdate);
                await this.updateUsersForDSTChanges(timezonesToUpdate);
            } else {
                console.log('✅ No DST changes detected');
            }

        } catch (error) {
            console.error('❌ DST check failed:', error);
            await logger.error(`**DST Check Error** | **Error:** ${error.message}`);
        }
    }

    /**
     * Check if a specific timezone has DST change and it's currently 5am there
     * @param {string} timezone - Timezone identifier
     * @param {DateTime} [at] - Moment to check at (injectable for tests/simulation)
     * @returns {boolean} True if DST changed and it's 5am
     */
    async checkTimezoneForDST(timezone, at) {
        try {
            const now = (at ?? DateTime.now()).setZone(timezone);

            // Only check if it's currently 5am in this timezone
            if (now.hour !== 5) {
                return false;
            }

            console.log(`⏰ It's 5am in ${timezone}, checking for DST change...`);

            // Get yesterday's offset at this same time
            const yesterday = now.minus({ days: 1 });
            
            // Compare offsets
            const todayOffset = now.offset;
            const yesterdayOffset = yesterday.offset;

            if (todayOffset !== yesterdayOffset) {
                const todayOffsetStr = timezoneService.getCurrentOffset(timezone);
                console.log(`🔄 DST change detected in ${timezone}: ${yesterdayOffset}min → ${todayOffset}min (${todayOffsetStr})`);
                
                await logger.log(`**DST Change Detected** | **Timezone:** \`${timezone}\` | **Old Offset:** ${yesterdayOffset}min | **New Offset:** ${todayOffset}min (${todayOffsetStr})`);
                
                return true;
            }

            return false;

        } catch (error) {
            console.error(`❌ Error checking DST for ${timezone}:`, error);
            return false;
        }
    }

    /**
     * Update all users in affected timezones
     * @param {Array} timezones - Array of timezone identifiers that had DST changes
     */
    async updateUsersForDSTChanges(timezones) {
        let totalUsersUpdated = 0;

        for (const timezone of timezones) {
            try {
                const usersInTimezone = await databaseService.getUsersInTimezone(timezone);
                console.log(`👥 Found ${usersInTimezone.length} users in ${timezone}`);

                if (usersInTimezone.length === 0) {
                    continue;
                }

                let usersUpdated = 0;

                for (const userId of usersInTimezone) {
                    try {
                        const updated = await this.updateUserNicknamesForDST(userId, timezone);
                        if (updated > 0) {
                            usersUpdated += updated;
                        }
                    } catch (error) {
                        console.error(`❌ Error updating user ${userId} for DST:`, error.message);
                    }
                }

                console.log(`✅ Updated ${usersUpdated} users in ${timezone}`);
                totalUsersUpdated += usersUpdated;

                // Log DST change summary
                const newOffset = timezoneService.getCurrentOffset(timezone);
                await logger.logDSTChange(timezone, usersUpdated, newOffset);

            } catch (error) {
                console.error(`❌ Error processing users in ${timezone}:`, error);
            }
        }

        if (totalUsersUpdated > 0) {
            console.log(`🎉 DST update complete: ${totalUsersUpdated} users updated across ${timezones.length} timezone(s)`);
            await logger.log(`**DST Update Complete** | **Users Updated:** ${totalUsersUpdated} | **Timezones:** ${timezones.join(', ')}`);
        }
    }

    /**
     * Update a user's nickname across all their servers for DST change
     * @param {string} userId - Discord user ID
     * @param {string} timezone - Timezone identifier
     * @returns {number} Number of servers where user was updated
     */
    async updateUserNicknamesForDST(userId, timezone) {
        try {
            const userServers = await databaseService.getUserServers(userId);

            if (userServers.length === 0) {
                return 0;
            }

            console.log(`🔄 Updating user ${userId} across ${userServers.length} servers for DST...`);

            const client = clientProvider.getClient();

            // Each shard only sees its own guilds, so ask every shard to update what it can.
            // Without sharding (npm run single) there is just the local client.
            const shardResults = client.shard
                ? await client.shard.broadcastEval(
                    (shardClient, { userId, userServers, timezone }) =>
                        shardClient.nicknameService.updateAcrossGuilds(shardClient, userId, userServers, timezone),
                    { context: { userId, userServers, timezone } }
                )
                : [await nicknameService.updateAcrossGuilds(client, userId, userServers, timezone)];

            let totalUpdatedCount = 0;

            for (const shardResult of shardResults) {
                totalUpdatedCount += shardResult.updatedCount;

                for (const result of shardResult.results) {
                    if (result.status === 'updated') {
                        console.log(`📝 DST: Updated ${userId} in ${result.serverName}: "${result.oldNickname}" → "${result.newNickname}"`);
                        await logger.logNicknameUpdate(userId, result.serverId, result.oldNickname, result.newNickname);
                    } else if (result.status === 'skipped_owner') {
                        console.log(`👑 DST: Skipped server owner ${userId} in ${result.serverName}`);
                    } else if (result.status === 'skipped_permissions') {
                        console.log(`❌ DST: Cannot manage ${userId} in ${result.serverName}`);
                    } else if (result.status === 'error') {
                        console.error(`❌ DST: Failed to update ${userId} in ${result.serverName}: ${result.message}`);
                    }
                }
            }

            return totalUpdatedCount;

        } catch (error) {
            console.error(`❌ Error updating user ${userId} for DST:`, error);
            return 0;
        }
    }

    /**
     * Get service status
     * @returns {Object} Service status information
     */
    getStatus() {
        const nextHour = new Date();
        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
        
        return {
            isRunning: this.isRunning,
            intervalId: this.intervalId !== null,
            nextCheck: this.isRunning ? `Every hour on the hour (next: ${nextHour.toTimeString().substring(0, 5)})` : 'Not scheduled'
        };
    }

}

module.exports = new DSTService();
