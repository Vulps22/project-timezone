const { PermissionFlagsBits } = require('discord.js');
const timezoneService = require('./timezoneService');

/**
 * Single place that decides what a member's nickname should look like and applies it.
 * Used by /timezone set, the guildMemberUpdate listener and the DST updater.
 */
class NicknameService {
    /**
     * The name the member is currently shown as, without any timezone suffix.
     * Uses displayName (nickname → global display name → username) so users without
     * a server nickname keep their display name instead of dropping to their @handle.
     * @param {GuildMember} member
     * @returns {string}
     */
    getBaseName(member) {
        const shownName = member.nickname ?? member.user.globalName ?? member.user.username;
        return timezoneService.removeTimezoneFromNickname(shownName);
    }

    /**
     * @param {GuildMember} member
     * @param {string} timezone
     * @returns {string|null} Nickname with the current offset, or null if it couldn't be built
     */
    buildNickname(member, timezone) {
        return timezoneService.formatNicknameWithTimezone(this.getBaseName(member), timezone, member.user.username);
    }

    /**
     * Nickname to set when removing the timezone. Returns null (reset) when the
     * cleaned name is just what Discord would show anyway.
     * @param {GuildMember} member
     * @returns {string|null}
     */
    buildClearedNickname(member) {
        const cleanName = this.getBaseName(member);
        const defaultName = member.user.globalName ?? member.user.username;
        return cleanName === defaultName ? null : cleanName;
    }

    /**
     * Why the bot can't edit this member's nickname, or null if it can.
     * @param {GuildMember} member
     * @returns {'skipped_owner'|'skipped_permissions'|null}
     */
    getBlockReason(member) {
        if (member.guild.ownerId === member.id) return 'skipped_owner';

        // `manageable` only checks role hierarchy, not whether the bot has Manage Nicknames
        const me = member.guild.members?.me;
        if (me && !me.permissions.has(PermissionFlagsBits.ManageNicknames)) return 'skipped_permissions';
        if (!member.manageable) return 'skipped_permissions';
        return null;
    }

    /**
     * Apply the timezone suffix to a member's nickname if it isn't already correct.
     * @param {GuildMember} member
     * @param {string} timezone
     * @returns {Promise<{serverId: string, serverName: string, status: string, oldNickname?: string, newNickname?: string, message?: string}>}
     */
    async applyTimezone(member, timezone) {
        const base = { serverId: member.guild.id, serverName: member.guild.name };

        const blockReason = this.getBlockReason(member);
        if (blockReason) return { ...base, status: blockReason };

        const oldNickname = member.nickname;
        const newNickname = this.buildNickname(member, timezone);

        if (!newNickname) return { ...base, status: 'error', message: 'Could not build nickname' };
        if (newNickname === oldNickname) return { ...base, status: 'no_change' };

        await member.setNickname(newNickname);
        return { ...base, status: 'updated', oldNickname, newNickname };
    }

    /**
     * Update a user's nickname in every listed guild that this client can see.
     * Runs inside each shard (via broadcastEval) so it must only rely on the given client.
     * @param {Client} client
     * @param {string} userId
     * @param {string[]} serverIds
     * @param {string} timezone
     * @returns {Promise<{shardId: number, updatedCount: number, results: Array}>}
     */
    async updateAcrossGuilds(client, userId, serverIds, timezone) {
        const results = [];

        for (const serverId of serverIds) {
            const guild = client.guilds.cache.get(serverId);
            if (!guild) continue; // Guild lives on another shard

            try {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member) continue;
                results.push(await this.applyTimezone(member, timezone));
            } catch (error) {
                results.push({ serverId, serverName: guild.name, status: 'error', message: error.message });
            }
        }

        return {
            shardId: client.shard?.ids[0] ?? 0,
            updatedCount: results.filter(r => r.status === 'updated').length,
            results
        };
    }
}

module.exports = new NicknameService();
