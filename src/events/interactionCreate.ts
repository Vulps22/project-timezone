import {
    Events,
    PermissionsBitField,
    EmbedBuilder,
    MessageFlags,
    type Interaction,
    type ChatInputCommandInteraction,
} from 'discord.js';
import type { DiscordEvent } from '../types';
import { logger } from '../bot';

const event: DiscordEvent<typeof Events.InteractionCreate> = {
    name: Events.InteractionCreate,

    async execute(interaction: Interaction) {
        try {
            if (interaction.isAutocomplete()) {
                const command = interaction.client.commands?.get(interaction.commandName);
                if (command?.autocomplete) {
                    await command.autocomplete(interaction);
                }
                return;
            }

            if (interaction.isChatInputCommand()) {
                const missing = getMissingPermissions(interaction);
                if (missing.length > 0) {
                    await sendPermissionsError(interaction, missing);
                    return;
                }

                const command = interaction.client.commands?.get(interaction.commandName);
                if (!command) {
                    if (interaction.isRepliable()) {
                        await interaction.reply({ content: '❌ Command not found.', flags: [MessageFlags.Ephemeral] });
                    }
                    return;
                }

                await command.execute(interaction);
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('❌ interactionCreate error:', error);

            if ('commandName' in interaction) {
                await logger.error(
                    `**Interaction Error** | **Command:** ${interaction.commandName} | **User:** <@${interaction.user.id}> | **Error:** ${error.message}`,
                );
            }
        }
    },
};

function getMissingPermissions(interaction: ChatInputCommandInteraction): bigint[] {
    if (!interaction.guild) return [];
    const bot = interaction.guild.members.me;
    if (!bot) return [];

    const required = [
        PermissionsBitField.Flags.ManageNicknames,
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
    ];

    return required.filter(p => !bot.permissions.has(p));
}

async function sendPermissionsError(
    interaction: ChatInputCommandInteraction,
    missing: bigint[],
): Promise<void> {
    const names: Record<string, string> = {
        [String(PermissionsBitField.Flags.ManageNicknames)]: 'Manage Nicknames',
        [String(PermissionsBitField.Flags.ViewChannel)]: 'View Channel',
        [String(PermissionsBitField.Flags.SendMessages)]: 'Send Messages',
    };

    const list = missing.map(p => `• ${names[String(p)] ?? 'Unknown'}`).join('\n');

    const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🚫 Missing Permissions')
        .setDescription('I need additional permissions to work in this server.')
        .addFields(
            { name: '❌ Missing', value: list },
            { name: '🔧 How to Fix', value: 'Server Settings → Roles → Timey Zoney → enable the permissions above' },
        );

    try {
        await interaction.reply({ embeds: [embed] });
    } catch {
        await interaction.reply({ content: `🚫 Missing permissions:\n${list}` }).catch(() => undefined);
    }
}

export default event;
