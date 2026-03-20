import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../types';
import { db, timezoneService, logger } from '../bot';

const timezone: Command = {
    data: new SlashCommandBuilder()
        .setName('timezone')
        .setDescription('Manage your timezone settings')
        .addSubcommand(sub =>
            sub
                .setName('set')
                .setDescription('Set your timezone')
                .addStringOption(opt =>
                    opt
                        .setName('timezone')
                        .setDescription('Your timezone (e.g. America/New_York)')
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        )
        .addSubcommand(sub =>
            sub
                .setName('time')
                .setDescription('View current time for a user')
                .addUserOption(opt =>
                    opt.setName('user').setDescription('User to check (defaults to you)').setRequired(false),
                ),
        )
        .addSubcommand(sub =>
            sub.setName('clear').setDescription('Clear your timezone data and reset your nickname'),
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused();
        const choices = timezoneService.searchTimezones(focused);
        await interaction.respond(choices.map(c => ({ name: c.name, value: c.value }))).catch(() => undefined);
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'set') return handleSet(interaction);
        if (sub === 'time') return handleTime(interaction);
        if (sub === 'clear') return handleClear(interaction);
    },
};

// ─── /timezone set ────────────────────────────────────────────────────────────

async function handleSet(interaction: ChatInputCommandInteraction): Promise<void> {
    const timezone = interaction.options.getString('timezone', true);
    const userId = interaction.user.id;
    const serverId = interaction.guildId!;

    await logger.logCommand('timezone set', userId, serverId, 'Received');

    if (!timezoneService.isValidTimezone(timezone)) {
        await interaction.reply({
            content: '❌ Invalid timezone. Try something like `America/New_York` or `Europe/London`.',
            flags: [MessageFlags.Ephemeral],
        });
        await logger.logCommand('timezone set', userId, serverId, 'Failed — invalid timezone');
        return;
    }

    const offset = timezoneService.getCurrentOffset(timezone);
    db.setUserTimezone(userId, timezone);
    db.addUserToServer(userId, serverId);

    const member = interaction.member;
    const isOwner = interaction.guild!.ownerId === userId;
    const currentNick = (member as { nickname?: string | null })?.nickname ?? null;
    const newNickname = timezoneService.formatNicknameWithTimezone(currentNick, timezone, interaction.user.username);

    if (isOwner) {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setTitle('⚠️ Timezone Set (Server Owner Limitation)')
                    .addFields(
                        { name: 'Timezone', value: timezone, inline: true },
                        { name: 'Offset', value: offset, inline: true },
                        { name: 'Note', value: 'Discord prevents bots from changing server owner nicknames.' },
                        { name: 'Suggested Nickname', value: newNickname ? `\`${newNickname}\`` : 'N/A' },
                    ),
            ],
            flags: [MessageFlags.Ephemeral],
        });
        await logger.logTimezoneSet(userId, serverId, timezone, offset);
        return;
    }

    if (!newNickname) {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setTitle('⚠️ Timezone Set (Nickname Update Failed)')
                    .addFields(
                        { name: 'Timezone', value: timezone, inline: true },
                        { name: 'Offset', value: offset, inline: true },
                        { name: 'Issue', value: 'Could not generate a nickname.' },
                    ),
            ],
            flags: [MessageFlags.Ephemeral],
        });
        await logger.logTimezoneSet(userId, serverId, timezone, offset);
        return;
    }

    try {
        await (interaction.member as import('discord.js').GuildMember).setNickname(newNickname);

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('✅ Timezone Set')
                    .addFields(
                        { name: 'Timezone', value: timezone, inline: true },
                        { name: 'Offset', value: offset, inline: true },
                        { name: 'Nickname', value: `\`${newNickname}\`` },
                    )
                    .setFooter({ text: 'Your timezone will be updated automatically when DST changes.' }),
            ],
            flags: [MessageFlags.Ephemeral],
        });

        await logger.logTimezoneSet(userId, serverId, timezone, offset);
        await logger.logNicknameUpdate(userId, serverId, currentNick ?? interaction.user.username, newNickname);
    } catch {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffaa00)
                    .setTitle('⚠️ Timezone Set (Nickname Update Failed)')
                    .addFields(
                        { name: 'Timezone', value: timezone, inline: true },
                        { name: 'Offset', value: offset, inline: true },
                        { name: 'Issue', value: 'Timezone saved, but could not update your nickname due to permissions.' },
                    ),
            ],
            flags: [MessageFlags.Ephemeral],
        });
        await logger.logTimezoneSet(userId, serverId, timezone, offset);
        await logger.logPermissionError(userId, serverId, 'update nickname');
    }
}

// ─── /timezone time ───────────────────────────────────────────────────────────

async function handleTime(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const userId = interaction.user.id;
    const serverId = interaction.guildId!;

    await logger.logCommand('timezone time', userId, serverId, `Target: ${targetUser.id}`);

    const userData = db.getUserTimezone(targetUser.id);
    if (!userData) {
        const msg =
            targetUser.id === userId
                ? "❌ You haven't set your timezone yet. Use `/timezone set` to get started."
                : `❌ ${targetUser.username} hasn't set their timezone yet.`;
        await interaction.reply({ content: msg, flags: [MessageFlags.Ephemeral] });
        return;
    }

    const timeInfo = timezoneService.getCurrentTime(userData.timezone_identifier);
    if (!timeInfo) {
        await interaction.reply({ content: '❌ Could not retrieve time information.', flags: [MessageFlags.Ephemeral] });
        return;
    }

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(`🕐 Current Time for ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '📍 Timezone', value: userData.timezone_identifier, inline: true },
                    { name: '⏰ Time', value: timeInfo.time, inline: true },
                    { name: '📅 Date', value: timeInfo.date, inline: true },
                    { name: '🌍 UTC Offset', value: timeInfo.offset, inline: true },
                    { name: '📆 Day', value: timeInfo.dayName, inline: true },
                    { name: '🗓️ Month', value: timeInfo.monthName, inline: true },
                    { name: '📋 Full DateTime', value: timeInfo.formatted },
                )
                .setFooter({ text: `Timezone set ${relativeTime(userData.created_at)}` })
                .setTimestamp(),
        ],
        flags: [MessageFlags.Ephemeral],
    });
}

// ─── /timezone clear ──────────────────────────────────────────────────────────

async function handleClear(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const serverId = interaction.guildId!;

    await logger.logCommand('timezone clear', userId, serverId, 'Received');

    const userData = db.getUserTimezone(userId);
    if (!userData) {
        await interaction.reply({ content: '❌ No timezone data found.', flags: [MessageFlags.Ephemeral] });
        return;
    }

    const member = interaction.member as import('discord.js').GuildMember;
    const isOwner = interaction.guild!.ownerId === userId;
    const currentNickname = member.nickname ?? interaction.user.username;
    const cleanNickname = timezoneService.removeTimezoneFromNickname(currentNickname);

    let nicknameCleared = false;

    if (!isOwner && cleanNickname !== currentNickname && member.manageable) {
        try {
            const target = member.nickname && cleanNickname !== interaction.user.username
                ? cleanNickname
                : null;
            await member.setNickname(target);
            nicknameCleared = true;
            await logger.logNicknameUpdate(userId, serverId, currentNickname, target ?? interaction.user.username);
        } catch {
            await logger.logPermissionError(userId, serverId, 'clear timezone from nickname');
        }
    }

    db.deleteUser(userId);

    const embed = new EmbedBuilder()
        .setColor(nicknameCleared || isOwner ? 0xffaa00 : 0x00ff00)
        .setTitle(nicknameCleared ? '✅ Timezone Cleared' : '✅ Timezone Data Cleared')
        .setDescription('Your timezone data has been removed.')
        .addFields({ name: 'Cleared', value: '• Timezone preference\n• Server associations' })
        .setFooter({ text: 'This action cannot be undone.' });

    if (isOwner) {
        embed.addFields({ name: 'Note', value: 'As server owner, you may need to manually remove the timezone from your nickname.' });
    }

    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    await logger.logCommand('timezone clear', userId, serverId, `Success — cleared ${userData.timezone_identifier}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(timestamp: string): string {
    const diff = Date.now() - new Date(timestamp).getTime();
    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor(diff / 3_600_000);
    const mins = Math.floor(diff / 60_000);
    if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
    if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    if (mins > 0) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    return 'just now';
}

export default timezone;
