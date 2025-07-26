const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const databaseService = require('../services/databaseService');
const timezoneService = require('../services/timezoneService');
const { logger } = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timezone')
        .setDescription('Manage your timezone settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set your timezone')
                .addStringOption(option =>
                    option
                        .setName('timezone')
                        .setDescription('Your timezone (e.g., America/New_York, Europe/London)')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('time')
                .setDescription('View current time for a user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to check time for (defaults to yourself)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear your timezone and remove it from your nickname')
        ),

    async autocomplete(interaction) {
        try {
            console.log(`🔍 Timezone autocomplete triggered by ${interaction.user.tag}`);
            
            const focusedValue = interaction.options.getFocused();
            console.log(`📝 Focused value: "${focusedValue}" (length: ${focusedValue.length})`);
            
            const choices = timezoneService.searchTimezones(focusedValue);
            console.log(`🎯 Found ${choices.length} timezone choices for query: "${focusedValue}"`);
            
            if (choices.length > 0) {
                console.log(`📋 First 3 choices:`, choices.slice(0, 3).map(c => c.name));
            }
            
            const response = choices.map(choice => ({ name: choice.name, value: choice.value }));
            
            await interaction.respond(response);
            console.log(`✅ Autocomplete response sent with ${response.length} options`);
            
        } catch (error) {
            console.error('❌ Autocomplete error:', error);
            console.error('📋 Error context:', {
                user: interaction.user.tag,
                commandName: interaction.commandName,
                focused: interaction.options?.getFocused() || 'N/A'
            });
            
            // Try to send an empty response to prevent Discord errors
            try {
                await interaction.respond([]);
                console.log('⚠️ Sent empty autocomplete response due to error');
            } catch (respondError) {
                console.error('❌ Failed to send empty autocomplete response:', respondError);
            }
        }
    },

    async execute(interaction) {

        const subcommand = interaction.options.getSubcommand();
        
        try {
            if (subcommand === 'set') {
                await this.handleSetTimezone(interaction);
            } else if (subcommand === 'time') {
                await this.handleTimeCheck(interaction);
            } else if (subcommand === 'clear') {
                await this.handleClearData(interaction);
            }
        } catch (error) {
            console.error('Error executing timezone command:', error);
            
            // Check if we can still respond
            if (!interaction.replied && !interaction.deferred && interaction.isRepliable()) {
                try {
                    await interaction.reply({ 
                        content: '❌ An error occurred while processing your request.',
                        flags: [MessageFlags.Ephemeral]
                    });
                } catch (replyError) {
                    console.error('❌ Failed to send error reply:', replyError);
                }
            }
            
            // Log error
            await logger.error(`**Timezone Command Error** | **User:** <@${interaction.user.id}> | **Server:** \`${interaction.guildId}\` | **Error:** ${error.message}`);
        }
    },

    async handleSetTimezone(interaction) {

        const timezone = interaction.options.getString('timezone');
        const userId = interaction.user.id;
        const serverId = interaction.guildId;
        
        // Log command received
        await logger.logCommand('timezone set', userId, serverId, 'Received');
        
        // Validate timezone
        if (!timezoneService.isValidTimezone(timezone)) {
            await interaction.reply({
                content: '❌ Invalid timezone. Please use a valid timezone identifier like `America/New_York` or `Europe/London`.',
                flags: ['Ephemeral']
            });
            
            await logger.logCommand('timezone set', userId, serverId, 'Failed - Invalid timezone');
            return;
        }
        
        try {
            // Get current offset
            const offset = timezoneService.getCurrentOffset(timezone);
            
            // Save to database
            await databaseService.setUserTimezone(userId, timezone);
            await databaseService.addUserToServer(userId, serverId);
            
            // Try to update nickname
            const member = interaction.member;
            const newNickname = timezoneService.formatNicknameWithTimezone(
                member.nickname, 
                timezone, 
                interaction.user.username,
                interaction.user.id  // Pass user ID for special cases
            );

            // Check if user is server owner (Discord doesn't allow bots to manage owner nicknames)
            const isServerOwner = interaction.guild.ownerId === interaction.user.id;
            
            if (isServerOwner) {
                const embed = new EmbedBuilder()
                    .setColor(0xFFAA00)
                    .setTitle('⚠️ Timezone Set (Server Owner Limitation)')
                    .setDescription('Your timezone has been changed.')
                    .addFields(
                        { name: 'Timezone', value: timezone, inline: true },
                        { name: 'Current Offset', value: offset, inline: true },
                        { name: 'Note:', value: 'As the server owner, Discord prevents bots from changing your nickname. This is not a permission issue, but a limitation of Discord itself.', inline: false },
                        { name: 'Suggested Nickname:', value: newNickname ? `\`${newNickname}\`` : 'Could not generate nickname', inline: false }
                    )
                    .setFooter({ text: 'Your timezone is saved and will work on other servers where you\'re not the owner.' });
                
                await interaction.reply({ embeds: [embed], flags: ['Ephemeral'] });
                
                // Log timezone set with server owner limitation
                await logger.logTimezoneSet(userId, serverId, timezone, offset);
                await logger.logCommand('timezone set', userId, serverId, 'Success - Server owner limitation (Discord restriction)');
                return;
            }
            
            if (newNickname) {
                try {
                    await member.setNickname(newNickname);
                    
                    const embed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('✅ Timezone Set Successfully')
                        .addFields(
                            { name: 'Timezone', value: timezone, inline: true },
                            { name: 'Current Offset', value: offset, inline: true },
                            { name: 'Nickname Updated', value: `\`${newNickname}\``, inline: false }
                        )
                        .setFooter({ text: 'Your timezone will be updated automatically across all servers with this bot.' });
                    
                    await interaction.reply({ embeds: [embed], flags: ['Ephemeral'] });
                    
                    // Log successful timezone set
                    await logger.logTimezoneSet(userId, serverId, timezone, offset);
                    await logger.logNicknameUpdate(userId, serverId, member.nickname || interaction.user.username, newNickname);
                    
                } catch (nicknameError) {
                    // Nickname update failed, but timezone was saved
                    const embed = new EmbedBuilder()
                        .setColor(0xFFAA00)
                        .setTitle('⚠️ Timezone Set (Nickname Update Failed)')
                        .addFields(
                            { name: 'Timezone', value: timezone, inline: true },
                            { name: 'Current Offset', value: offset, inline: true },
                            { name: 'Issue', value: 'Could not update your nickname due to permission restrictions.', inline: false }
                        )
                        .setFooter({ text: 'Your timezone is saved and will work on servers where I can manage nicknames.' });
                    
                    await interaction.reply({ embeds: [embed], flags: ['Ephemeral'] });
                    
                    // Log timezone set with permission error
                    await logger.logTimezoneSet(userId, serverId, timezone, offset);
                    await logger.logPermissionError(userId, serverId, 'update nickname');
                }
            } else {
                // Can't update nickname, but timezone was saved
                const embed = new EmbedBuilder()
                    .setColor(0xFFAA00)
                    .setTitle('⚠️ Timezone Set (Nickname Update Failed)')
                    .addFields(
                        { name: 'Timezone', value: timezone, inline: true },
                        { name: 'Current Offset', value: offset, inline: true },
                        { name: 'Issue', value: 'Could not update your nickname. This may be due to permission restrictions or role hierarchy.', inline: false }
                    )
                    .setFooter({ text: 'Your timezone is saved and will work on servers where I can manage nicknames.' });
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
                
                // Log timezone set with permission error
                await logger.logTimezoneSet(userId, serverId, timezone, offset);
                await logger.logPermissionError(userId, serverId, 'update nickname');
            }
            
        } catch (dbError) {
            console.error('Database error setting timezone:', dbError);
            
            await interaction.reply({
                content: '❌ Failed to save your timezone. Please try again later.',
                flags: ['Ephemeral']
            });
            
            await logger.logCommand('timezone set', userId, serverId, `Failed - Database error: ${dbError.message}`);
        }
    },

    async handleClearData(interaction) {
        const userId = interaction.user.id;
        const serverId = interaction.guildId;
        
        // Log command received
        await logger.logCommand('timezone clear', userId, serverId, 'Received');
        
        try {
            // Check if user has data
            const userData = await databaseService.getUserTimezone(userId);
            
            if (!userData) {
                await interaction.reply({
                    content: '❌ No timezone data found for your account.',
                    ephemeral: true
                });
                
                await logger.logCommand('timezone clear', userId, serverId, 'Failed - No data found');
                return;
            }
            
            // Try to remove timezone from nickname first
            const member = interaction.member;
            const currentNickname = member.nickname || interaction.user.username;
            const cleanNickname = timezoneService.removeTimezoneFromNickname(currentNickname);
            
            let nicknameCleared = false;
            let nicknameError = null;
            
            // Check if user is server owner (Discord doesn't allow bots to manage owner nicknames)
            const isServerOwner = interaction.guild.ownerId === interaction.user.id;
            
            if (!isServerOwner && cleanNickname !== currentNickname) {
                try {
                    // Only set nickname if it actually changed and it's not just the username
                    if (member.nickname && cleanNickname !== interaction.user.username) {
                        await member.setNickname(cleanNickname);
                        nicknameCleared = true;
                    } else if (member.nickname) {
                        // If clean nickname equals username, reset to no nickname
                        await member.setNickname(null);
                        nicknameCleared = true;
                    }
                } catch (error) {
                    console.error('Error clearing nickname:', error);
                    nicknameError = error;
                }
            }
            
            // Delete user data
            await databaseService.deleteUser(userId);
            
            // Create response embed
            let embed;
            
            if (isServerOwner) {
                embed = new EmbedBuilder()
                    .setColor(0xFFAA00)
                    .setTitle('⚠️ Timezone Cleared (Server Owner Limitation)')
                    .setDescription('Your timezone data has been cleared from our database.')
                    .addFields(
                        { name: 'What was cleared:', value: '• Your timezone preference\n• Server associations\n• All related data', inline: false },
                        { name: 'Note:', value: 'As the server owner, Discord prevents bots from changing your nickname. You\'ll need to manually remove the timezone from your nickname if desired.', inline: false }
                    )
                    .setFooter({ text: 'This action cannot be undone.' });
            } else if (nicknameCleared) {
                embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ Timezone Cleared Successfully')
                    .setDescription('Your timezone data has been cleared and timezone removed from your nickname.')
                    .addFields(
                        { name: 'What was cleared:', value: '• Your timezone preference\n• Server associations\n• All related data\n• Timezone from your nickname', inline: false }
                    )
                    .setFooter({ text: 'This action cannot be undone.' });
            } else if (nicknameError) {
                embed = new EmbedBuilder()
                    .setColor(0xFFAA00)
                    .setTitle('⚠️ Timezone Cleared (Nickname Update Failed)')
                    .setDescription('Your timezone data has been cleared, but I couldn\'t update your nickname.')
                    .addFields(
                        { name: 'What was cleared:', value: '• Your timezone preference\n• Server associations\n• All related data', inline: false },
                        { name: 'Note:', value: 'Due to permission restrictions, I couldn\'t remove the timezone from your nickname. You can manually update it if desired.', inline: false }
                    )
                    .setFooter({ text: 'This action cannot be undone.' });
            } else {
                embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ Timezone Cleared Successfully')
                    .setDescription('Your timezone data has been cleared from our database.')
                    .addFields(
                        { name: 'What was cleared:', value: '• Your timezone preference\n• Server associations\n• All related data', inline: false },
                        { name: 'Note:', value: 'No timezone information was found in your nickname to remove.', inline: false }
                    )
                    .setFooter({ text: 'This action cannot be undone.' });
            }
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            
            // Log successful data clearing
            const logMessage = nicknameCleared 
                ? `Success - Cleared data and nickname for timezone: ${userData.timezone_identifier}`
                : `Success - Cleared data for timezone: ${userData.timezone_identifier} (nickname ${isServerOwner ? 'server owner limitation' : nicknameError ? 'permission error' : 'no change needed'})`;
            
            await logger.logCommand('timezone clear', userId, serverId, logMessage);
            
            if (nicknameCleared) {
                await logger.logNicknameUpdate(userId, serverId, currentNickname, cleanNickname);
            } else if (nicknameError && !isServerOwner) {
                await logger.logPermissionError(userId, serverId, 'clear timezone from nickname');
            }
            
        } catch (dbError) {
            console.error('Database error clearing user:', dbError);
            
            await interaction.reply({
                content: '❌ Failed to clear your data. Please try again later.',
                ephemeral: true
            });
            
            await logger.logCommand('timezone clear', userId, serverId, `Failed - Database error: ${dbError.message}`);
        }
    },

    async handleTimeCheck(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = interaction.user.id;
        const serverId = interaction.guildId;
        
        try {
            // Log command received
            await logger.logCommand('timezone time', userId, serverId, `Received - Target: ${targetUser.id}`);
            
            // Get target user's timezone data
            const userData = await databaseService.getUserTimezone(targetUser.id);
            
            if (!userData) {
                const isOwnTime = targetUser.id === interaction.user.id;
                const message = isOwnTime 
                    ? '❌ You haven\'t set your timezone yet! Use `/timezone set` to get started.'
                    : `❌ ${targetUser.username} hasn't set their timezone yet.`;
                
                await interaction.reply({ content: message, ephemeral: true });
                
                await logger.logCommand('timezone time', userId, serverId, `Failed - No timezone data for ${targetUser.id}`);
                return;
            }
            
            // Get current time information
            const timeInfo = timezoneService.getCurrentTime(userData.timezone_identifier);
            
            if (!timeInfo) {
                await interaction.reply({
                    content: '❌ Error retrieving time information. Please try again.',
                    ephemeral: true
                });
                
                await logger.logCommand('timezone time', userId, serverId, `Failed - Invalid timezone: ${userData.timezone_identifier}`);
                return;
            }
            
            // Create embed with time information
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`🕐 Current Time for ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '📍 Timezone', value: userData.timezone_identifier, inline: true },
                    { name: '⏰ Current Time', value: timeInfo.time, inline: true },
                    { name: '📅 Date', value: timeInfo.date, inline: true },
                    { name: '🌍 UTC Offset', value: timeInfo.offset, inline: true },
                    { name: '📆 Day', value: timeInfo.dayName, inline: true },
                    { name: '🗓️ Month', value: timeInfo.monthName, inline: true },
                    { name: '📋 Full DateTime', value: timeInfo.formatted, inline: false }
                )
                .setFooter({ 
                    text: `Timezone set ${this.getRelativeTime(userData.created_at)}`,
                })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            
            // Log successful time check
            await logger.logCommand('timezone time', userId, serverId, `Success - Showed time for ${targetUser.id} (${userData.timezone_identifier}, ${timeInfo.offset})`);
            
        } catch (error) {
            console.error('Error executing timezone time command:', error);
            
            const errorMessage = '❌ An error occurred while retrieving time information.';
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            }
            
            // Log error
            await logger.error(`**Timezone Time Command Error** | **User:** <@${interaction.user.id}> | **Server:** \`${interaction.guildId}\` | **Error:** ${error.message}`);
        }
    },

    /**
     * Convert database timestamp to relative time
     * @param {string} timestamp - Database timestamp
     * @returns {string} Relative time string
     */
    getRelativeTime(timestamp) {
        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diffMs = now - date;
            
            const diffSeconds = Math.floor(diffMs / 1000);
            const diffMinutes = Math.floor(diffSeconds / 60);
            const diffHours = Math.floor(diffMinutes / 60);
            const diffDays = Math.floor(diffHours / 24);
            
            if (diffDays > 0) {
                return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
            } else if (diffHours > 0) {
                return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
            } else if (diffMinutes > 0) {
                return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
            } else {
                return 'just now';
            }
        } catch (error) {
            return 'unknown';
        }
    }
};
