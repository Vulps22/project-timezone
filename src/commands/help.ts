import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { Command } from '../types';

const help: Command = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available timezone bot commands'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🌍 Timey Zoney — Help Guide')
            .setDescription('Here are all available commands:')
            .setColor(0x00ae86)
            .addFields(
                {
                    name: '⚙️ `/timezone set <timezone>`',
                    value: 'Set your timezone and update your nickname.\n• Example: `/timezone set America/New_York`\n• Updates automatically on DST changes',
                },
                {
                    name: '🗑️ `/timezone clear`',
                    value: 'Remove your timezone data and reset your nickname.',
                },
                {
                    name: '🕐 `/timezone time [user]`',
                    value: 'Check the current local time for you or another user.',
                },
                {
                    name: '🌟 Key Features',
                    value: '• **Automatic DST Updates** — nickname updates at 5am on transition days\n• **Cross-Server** — works across all servers with this bot',
                },
                {
                    name: '💡 Tips',
                    value: '• Use autocomplete when setting your timezone\n• Server owners cannot have nicknames changed (Discord limitation)\n• Bot needs "Manage Nicknames" permission',
                },
            )
            .setFooter({
                text: 'Timey Zoney • Keep track of time across timezones!',
                iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    },
};

export default help;
