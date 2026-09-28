const { Events } = require('discord.js');
const { logger } = require('../utils/logger');
const databaseService = require('../services/databaseService');

module.exports = {
    name: Events.GuildDelete,
    /**
     * @param {Guild} guild
     */
    async execute(guild) {
        // Discord also fires this during outages; only act when the bot was actually removed
        if (!guild.available) {
            console.log(`⚠️ Guild ${guild.id} became unavailable, keeping its data`);
            return;
        }

        try {
            const { linksRemoved, usersScheduled } = await databaseService.removeServer(guild.id);
            console.log(`🗑️ Removed from ${guild.name}: ${linksRemoved} user link(s) deleted, ${usersScheduled} user(s) scheduled for deletion`);
            await logger.log(`🗑️ **Bot Removed** | **Server:** \`${guild.name}\` (\`${guild.id}\`) | **Links Removed:** ${linksRemoved} | **Users Scheduled For Deletion:** ${usersScheduled}`);
        } catch (error) {
            console.error('❌ Error in guildDelete:', error);
            await logger.error(`**Guild Delete Error** | **Server:** \`${guild.id}\` | **Error:** ${error.message}`);
        }
    },
};
