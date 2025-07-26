const { DateTime } = require('luxon');
const databaseService = require('./databaseService');
const timezoneService = require('./timezoneService');
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
     */
    async checkDSTChanges() {
        try {
            console.log('🔍 Checking for DST changes...');

            // Get all unique timezones from database
            const stats = await databaseService.getStats();
            const timezonesInUse = stats.popularTimezones.map(tz => tz.timezone_identifier);

            if (timezonesInUse.length === 0) {
                console.log('📭 No timezones in use, skipping DST check');
                return;
            }

            console.log(`🌍 Checking ${timezonesInUse.length} timezones for DST changes`);

            const timezonesToUpdate = [];

            for (const timezone of timezonesInUse) {
                try {
                    const dstChanged = await this.checkTimezoneForDST(timezone);
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
     * @returns {boolean} True if DST changed and it's 5am
     */
    async checkTimezoneForDST(timezone) {
        try {
            const now = DateTime.now().setZone(timezone);
            
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
            const client = require('../services/clientProvider').clientProvider.getClient();

            // Get all servers where this user has the bot
            const userServers = await databaseService.getUserServers(userId);
            
            if (userServers.length === 0) {
                return 0;
            }

            console.log(`🔄 Updating user ${userId} across ${userServers.length} servers for DST...`);

            // Use broadcastEval to update across all shards
            const results = await client.shard.broadcastEval(
                async (client, { userId, userServers, timezone, timezoneServiceCode }) => {
                    // Import timezone service code into eval context
                    eval(timezoneServiceCode);
                    
                    let localUpdatedCount = 0;
                    const localResults = [];

                    for (const serverId of userServers) {
                        try {
                            const guild = client.guilds.cache.get(serverId);
                            if (!guild) continue; // Server not on this shard

                            const member = await guild.members.fetch(userId).catch(() => null);
                            if (!member) continue;

                            // Skip server owners (Discord limitation)
                            if (guild.ownerId === userId) {
                                localResults.push({
                                    serverId,
                                    serverName: guild.name,
                                    status: 'skipped_owner',
                                    message: 'Server owner - Discord limitation'
                                });
                                continue;
                            }

                            // Skip if bot can't manage this member
                            if (!member.manageable) {
                                localResults.push({
                                    serverId,
                                    serverName: guild.name,
                                    status: 'skipped_permissions',
                                    message: 'Cannot manage member'
                                });
                                continue;
                            }

                            // Generate new nickname with updated timezone
                            const currentNickname = member.nickname || member.user.username;
                            
                            // Remove old timezone and add new one
                            const cleanNickname = removeTimezoneFromNickname(currentNickname);
                            const newNickname = formatNicknameWithTimezone(
                                cleanNickname === member.user.username ? null : cleanNickname,
                                timezone,
                                member.user.username,
                                userId  // Pass user ID for special cases
                            );

                            if (newNickname && newNickname !== currentNickname) {
                                await member.setNickname(newNickname);
                                
                                localResults.push({
                                    serverId,
                                    serverName: guild.name,
                                    status: 'updated',
                                    oldNickname: currentNickname,
                                    newNickname: newNickname
                                });
                                
                                localUpdatedCount++;
                            } else {
                                localResults.push({
                                    serverId,
                                    serverName: guild.name,
                                    status: 'no_change',
                                    message: 'Nickname already correct'
                                });
                            }

                        } catch (error) {
                            localResults.push({
                                serverId,
                                serverName: 'Unknown',
                                status: 'error',
                                message: error.message
                            });
                        }
                    }

                    return {
                        shardId: client.shard?.ids[0] ?? 0,
                        updatedCount: localUpdatedCount,
                        results: localResults
                    };
                },
                {
                    context: {
                        userId,
                        userServers,
                        timezone,
                        // Pass timezone service functions as strings to eval context
                        timezoneServiceCode: `
                            const { DateTime } = require('luxon');
                            
                            // Standalone function to validate timezone
                            const isValidTimezone = (timezone) => {
                                try {
                                    // Reject null/undefined/empty values
                                    if (!timezone || typeof timezone !== 'string') {
                                        return false;
                                    }
                                    
                                    // Try to create a DateTime in the specified timezone
                                    const dt = DateTime.now().setZone(timezone);
                                    // Check if it's a valid zone
                                    return dt.isValid && dt.zoneName !== null;
                                } catch (error) {
                                    return false;
                                }
                            };
                            
                            // Standalone function to get current offset
                            const getCurrentOffset = (timezone) => {
                                if (!isValidTimezone(timezone)) {
                                    throw new Error(\`Invalid timezone: \${timezone}\`);
                                }

                                try {
                                    const dt = DateTime.now().setZone(timezone);
                                    const offset = dt.offset; // Offset in minutes
                                    
                                    if (offset === 0) {
                                        return "UTC+0";
                                    }
                                    
                                    const hours = Math.abs(offset / 60);
                                    const sign = offset > 0 ? '+' : '-';
                                    
                                    // Format as whole hours or with .5 for 30-minute offsets
                                    if (hours % 1 === 0) {
                                        return \`UTC\${sign}\${Math.floor(hours)}\`;
                                    } else {
                                        return \`UTC\${sign}\${hours}\`;
                                    }
                                } catch (error) {
                                    console.error('Error getting current offset:', error);
                                    throw error;
                                }
                            };
                            
                            // Standalone function to remove timezone from nickname
                            const removeTimezoneFromNickname = (nickname) => {
                                if (!nickname) return '';
                                return nickname.replace(/\\s*\\(UTC[+-][\\d.]+\\)\$/i, '').trim();
                            };
                            
                            // Standalone function to format nickname with timezone
                            const formatNicknameWithTimezone = (currentNickname, timezone, username, userId = null) => {
                                try {
                                    // Special case for specific user ID - always use (UTC+Del)
                                    if (userId === '461232602188349470') {
                                        const baseName = currentNickname || username;
                                        const cleanName = removeTimezoneFromNickname(baseName);
                                        const specialNickname = \`\${cleanName} (UTC+Del)\`;
                                        
                                        // Discord nickname limit is 32 characters
                                        if (specialNickname.length > 32) {
                                            const maxBaseLength = 32 - 10; // 10 for " (UTC+Del)"
                                            const truncatedBase = cleanName.substring(0, maxBaseLength);
                                            return \`\${truncatedBase} (UTC+Del)\`;
                                        }
                                        
                                        return specialNickname;
                                    }

                                    const offset = getCurrentOffset(timezone);
                                    if (!offset) {
                                        return null;
                                    }
                                    
                                    // Use current nickname or fall back to username
                                    const baseName = currentNickname || username;
                                    
                                    // Remove existing timezone info if present
                                    const cleanName = removeTimezoneFromNickname(baseName);
                                    
                                    // Add new timezone info
                                    const newNickname = \`\${cleanName} (\${offset})\`;
                                    
                                    // Discord nickname limit is 32 characters
                                    if (newNickname.length > 32) {
                                        // Truncate the base name to fit
                                        const maxBaseLength = 32 - offset.length - 3; // 3 for " ()"
                                        const truncatedBase = cleanName.substring(0, maxBaseLength);
                                        return \`\${truncatedBase} (\${offset})\`;
                                    }
                                    
                                    return newNickname;
                                } catch (error) {
                                    console.error('Error formatting nickname with timezone:', error);
                                    return null;
                                }
                            };
                        `
                    }
                }
            );

            // Process results from all shards
            let totalUpdatedCount = 0;
            
            for (const shardResult of results) {
                if (shardResult.updatedCount > 0) {
                    totalUpdatedCount += shardResult.updatedCount;
                    
                    // Log successful updates from this shard
                    console.log(`✅ Shard ${shardResult.shardId}: Updated ${shardResult.updatedCount} servers for user ${userId}`);
                    
                    // Log individual nickname updates
                    for (const result of shardResult.results) {
                        if (result.status === 'updated') {
                            console.log(`📝 DST: Updated ${userId} in ${result.serverName}: "${result.oldNickname}" → "${result.newNickname}"`);
                            await logger.logNicknameUpdate(userId, result.serverId, result.oldNickname, result.newNickname);
                        } else if (result.status === 'skipped_owner') {
                            console.log(`👑 DST: Skipped server owner ${userId} in ${result.serverName}`);
                        } else if (result.status === 'skipped_permissions') {
                            console.log(`❌ DST: Cannot manage ${userId} in ${result.serverName}`);
                        }
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
