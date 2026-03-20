import { Events, type GuildMember } from 'discord.js';
import type { DiscordEvent } from '../types';
import { db, timezoneService, logger } from '../bot';

const event: DiscordEvent<typeof Events.GuildMemberAdd> = {
    name: Events.GuildMemberAdd,

    async execute(member: GuildMember) {
        const shardId = member.client.shard?.ids[0] ?? 0;
        if (shardId === 0) {
            await logger.log(
                `👋 **User Joined** | **User:** <@${member.user.id}> (\`${member.user.tag}\`) | **Server:** \`${member.guild.name}\``,
            );
        }

        const userData = db.getUserTimezone(member.user.id);
        if (!userData) return;

        // Track the new server association
        db.addUserToServer(member.user.id, member.guild.id);

        if (member.guild.ownerId === member.user.id) return;
        if (!member.manageable) return;

        const newNickname = timezoneService.formatNicknameWithTimezone(
            member.nickname,
            userData.timezone_identifier,
            member.user.username,
        );
        if (!newNickname) return;

        try {
            await member.setNickname(newNickname);
            await logger.logNicknameUpdate(
                member.user.id,
                member.guild.id,
                member.nickname ?? member.user.username,
                newNickname,
            );
        } catch (err) {
            console.error('❌ guildMemberAdd setNickname failed:', err instanceof Error ? err.message : err);
            await logger.logPermissionError(member.user.id, member.guild.id, 'apply timezone on join');
        }
    },
};

export default event;
