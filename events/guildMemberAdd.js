const { Events } = require('discord.js');
const { logger } = require('../utils/logger');
const databaseService = require('../services/databaseService');
const nicknameService = require('../services/nicknameService');

module.exports = {
    name: Events.GuildMemberAdd,
    /**
     * @param {GuildMember} member
     */
    async execute(member) {
        try {
            console.log(`👋 User ${member.user.tag} joined ${member.guild.name}`);

            const userData = await databaseService.getUserTimezone(member.id);
            if (!userData) return;

            // Known user turning up in a new server: link it (this also cancels any pending deletion)
            await databaseService.addUserToServer(member.id, member.guild.id);

            const result = await nicknameService.applyTimezone(member, userData.timezone_identifier);
            if (result.status === 'updated') {
                await logger.logNicknameUpdate(member.id, member.guild.id, result.oldNickname, result.newNickname);
            }

        } catch (error) {
            console.error('❌ Error in guildMemberAdd:', error);
            await logger.error(`**Guild Member Add Error** | **User:** <@${member.user.id}> | **Server:** \`${member.guild.name}\` | **Error:** ${error.message}`);
        }
    },
};
