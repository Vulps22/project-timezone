const { Events } = require('discord.js');
const { logger } = require('../utils/logger');
const databaseService = require('../services/databaseService');
const timezoneService = require('../services/timezoneService');
const nicknameService = require('../services/nicknameService');

module.exports = {
    name: Events.GuildMemberUpdate,
    /**
     * @param {GuildMember} oldMember
     * @param {GuildMember} newMember
     */
    async execute(oldMember, newMember) {
        try {
            // Check if nickname changed
            if (oldMember.nickname !== newMember.nickname) {
                console.log(`📝 Nickname changed for ${newMember.user.tag}: "${oldMember.nickname}" → "${newMember.nickname}"`);
                
                // Check if user has a timezone set
                const userData = await databaseService.getUserTimezone(newMember.user.id);
                
                if (!userData) {
                    return; // No timezone data, nothing to do
                }
                
                // Check if the new nickname is missing timezone info
                const currentNickname = newMember.nickname || newMember.user.username;
                const hasTimezoneInfo = timezoneService.hasTimezoneInfo(currentNickname);
                
                if (hasTimezoneInfo) {
                    return; // Already has timezone info
                }
                
                // Check if user is server owner (Discord doesn't allow bots to manage owner nicknames)
                const isServerOwner = newMember.guild.ownerId === newMember.user.id;
                
                if (isServerOwner) {
                    console.log(`👑 Cannot modify server owner nickname: ${newMember.user.tag}`);
                    return;
                }
                
                // Check if bot can manage this member
                if (!newMember.manageable) {
                    console.log(`❌ Cannot manage user ${newMember.user.tag} due to permissions/hierarchy`);
                    return;
                }
                
                // Generate new nickname with timezone
                const newNicknameWithTz = nicknameService.buildNickname(newMember, userData.timezone_identifier);
                
                if (!newNicknameWithTz) {
                    console.error(`❌ Failed to generate nickname with timezone for ${newMember.user.tag}`);
                    return;
                }
                
                // Apply the timezone to the nickname
                try {
                    await newMember.setNickname(newNicknameWithTz);
                    
                    console.log(`✅ Reapplied timezone to ${newMember.user.tag}: "${currentNickname}" → "${newNicknameWithTz}"`);
                    
                    // Log the reapplication
                    await logger.logNicknameUpdate(newMember.user.id, newMember.guild.id, currentNickname, newNicknameWithTz);
                    
                } catch (setNicknameError) {
                    console.error(`❌ Failed to set nickname for ${newMember.user.tag}:`, setNicknameError.message);
                }
            }
            
        } catch (error) {
            console.error('❌ Error in guildMemberUpdate:', error);
        }
    },
};
