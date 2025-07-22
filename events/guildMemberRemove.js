const { Events } = require('discord.js');
const { logger } = require('../utils/logger');

module.exports = {
    name: Events.GuildMemberRemove,
    /**
     * @param {GuildMember} member
     */
    async execute(member) {
        console.log(`👋 Member left: ${member.user.tag} (${member.user.id}) from ${member.guild.name}`);
        
        try {
            // Log member leave (only from shard 0 to avoid spam)
            const shardId = member.client.shard?.ids[0] ?? 0;
            if (shardId === 0) {
                await logger.log(`👋 **User Left** | **User:** <@${member.user.id}> (\`${member.user.tag}\`) | **Server:** \`${member.guild.name}\``);
            }
            
        } catch (error) {
            console.error('❌ Error in guildMemberRemove:', error);
            await logger.error(`**Guild Member Remove Error** | **User:** <@${member.user.id}> | **Server:** \`${member.guild.name}\` | **Error:** ${error.message}`);
        }
    },
};
