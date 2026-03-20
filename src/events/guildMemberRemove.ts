import { Events, type GuildMember } from 'discord.js';
import type { DiscordEvent } from '../types';
import { logger } from '../bot';

const event: DiscordEvent<typeof Events.GuildMemberRemove> = {
    name: Events.GuildMemberRemove,

    async execute(member: GuildMember) {
        const shardId = member.client.shard?.ids[0] ?? 0;
        if (shardId === 0) {
            await logger.log(
                `👋 **User Left** | **User:** <@${member.user.id}> (\`${member.user.tag}\`) | **Server:** \`${member.guild.name}\``,
            );
        }
    },
};

export default event;
