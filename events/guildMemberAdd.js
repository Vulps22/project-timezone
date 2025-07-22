const { Events } = require('discord.js');
const { logger } = require('../utils/logger');

module.exports = {
    name: Events.GuildMemberAdd,
    /**
     * @param {GuildMember} member
     */
    async execute(member) {
        try {
            console.log(`👋 User ${member.user.tag} joined ${member.guild.name}`);
            
            // Log new member join (only from shard 0 to avoid spam)
            const shardId = member.client.shard?.ids[0] ?? 0;
            if (shardId === 0) {
                await logger.log(`👋 **User Joined** | **User:** <@${member.user.id}> (\`${member.user.tag}\`) | **Server:** \`${member.guild.name}\``);
            }
            
            // Future: Check if user has timezone data and update nickname
            // This will be implemented when we create the nickname handler
            
        } catch (error) {
            console.error('❌ Error in guildMemberAdd:', error);
            await logger.error(`**Guild Member Add Error** | **User:** <@${member.user.id}> | **Server:** \`${member.guild.name}\` | **Error:** ${error.message}`);
        }
    },
};
