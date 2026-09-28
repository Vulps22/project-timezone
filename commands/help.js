const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available timezone bot commands and how to use them'),

    async execute(interaction) {
        try {
            const helpEmbed = new EmbedBuilder()
                .setTitle('🌍 Timey Zoney - Help Guide')
                .setDescription('Welcome to Timey Zoney! Here are all the available commands:')
                .setColor(0x00AE86)
                .addFields(
                    {
                        name: '⚙️ `/timezone set <timezone>`',
                        value: '**Set your timezone and update your nickname**\n' +
                               '• Example: `/timezone set America/New_York`\n' +
                               '• Your nickname will show your current UTC offset\n' +
                               '• Updates automatically when DST changes occur',
                        inline: false
                    },
                    {
                        name: '🗑️ `/timezone clear`',
                        value: '**Remove your timezone data and reset nickname**\n' +
                               '• Removes your timezone from the database\n' +
                               '• Resets your nickname to remove timezone info\n' +
                               '• Removes you from automatic DST updates',
                        inline: false
                    },
                    {
                        name: '🕐 `/timezone time [user]`',
                        value: '**Check current time for you or another user**\n' +
                               '• Without user: Shows your current local time\n' +
                               '• With user: Shows the specified user\'s local time\n' +
                               '• Example: `/timezone time @friend`',
                        inline: false
                    },
                    {
                        name: '❓ `/help`',
                        value: '**Show this help message**\n' +
                               '• Displays all available commands\n' +
                               '• Includes usage examples and tips',
                        inline: false
                    }
                )
                .addFields(
                    {
                        name: '🌟 Key Features',
                        value: '• **Automatic DST Updates**: Your nickname updates automatically when DST changes\n' +
                               '• **Cross-Server Support**: Works across all servers where you have the bot\n',
                        inline: false
                    },
                    {
                        name: '💡 Tips',
                        value: '• Use the autocomplete feature when setting your timezone\n' +
                               '• Your timezone updates happen automatically at 5am local time\n' +
                               '• Server owners cannot have their nicknames changed (Discord limitation)\n' +
                               '• The bot needs "Manage Nicknames" permission to update your nickname',
                        inline: false
                    },
                )
                .setFooter({ 
                    text: 'Timey Zoney • Keep track of time across timezones!',
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setTimestamp();

            await interaction.reply({ 
                embeds: [helpEmbed],
            });

        } catch (error) {
            console.error('Error executing help command:', error);
            
            // Only reply if we haven't replied yet
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ An error occurred while displaying the help information. Please try again.',
                        flags: [MessageFlags.Ephemeral]
                    });
                } catch (replyError) {
                    console.error('❌ Failed to send help error reply:', replyError);
                }
            }
        }
    }
};
