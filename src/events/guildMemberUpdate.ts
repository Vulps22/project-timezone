import { Events, type GuildMember } from 'discord.js';
import type { DiscordEvent } from '../types';
import { db, timezoneService, logger } from '../bot';

const event: DiscordEvent<typeof Events.GuildMemberUpdate> = {
    name: Events.GuildMemberUpdate,

    async execute(oldMember: GuildMember, newMember: GuildMember) {
        if (oldMember.nickname === newMember.nickname) return;

        const userData = db.getUserTimezone(newMember.user.id);
        if (!userData) return;

        const currentNickname = newMember.nickname ?? newMember.user.username;
        if (timezoneService.hasTimezoneInfo(currentNickname)) return;

        if (newMember.guild.ownerId === newMember.user.id) return;
        if (!newMember.manageable) return;

        const newNicknameWithTz = timezoneService.formatNicknameWithTimezone(
            newMember.nickname,
            userData.timezone_identifier,
            newMember.user.username,
        );
        if (!newNicknameWithTz) return;

        try {
            await newMember.setNickname(newNicknameWithTz);
            await logger.logNicknameUpdate(
                newMember.user.id,
                newMember.guild.id,
                currentNickname,
                newNicknameWithTz,
            );
        } catch (err) {
            console.error('❌ guildMemberUpdate setNickname failed:', err instanceof Error ? err.message : err);
        }
    },
};

export default event;
