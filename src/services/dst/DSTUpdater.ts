import type { IDSTUpdater, ShardUpdateResult } from '../../types';
import type { IClientProvider, ILogger } from '../../types';

/**
 * Updates Discord member nicknames across all shards when DST changes.
 *
 * The broadcastEval callback receives only plain serialisable data — no code
 * injection, no eval(). Luxon is required normally inside each shard process.
 */
export class DSTUpdater implements IDSTUpdater {
    constructor(
        private readonly clientProvider: IClientProvider,
        private readonly logger: ILogger,
    ) {}

    async updateUserNicknames(
        userId: string,
        timezone: string,
        userServers: string[],
    ): Promise<number> {
        if (userServers.length === 0) return 0;

        const client = this.clientProvider.getClient();

        const shardResults = await client.shard!.broadcastEval(
            async (c, { userId, userServers, timezone }) => {
                const { DateTime } = require('luxon') as typeof import('luxon');

                function offsetToString(offsetMinutes: number): string {
                    if (offsetMinutes === 0) return 'UTC+0';
                    const sign = offsetMinutes > 0 ? '+' : '-';
                    const total = Math.abs(offsetMinutes);
                    const hours = Math.floor(total / 60);
                    const mins = total % 60;
                    return mins === 0
                        ? `UTC${sign}${hours}`
                        : `UTC${sign}${hours + mins / 60}`;
                }

                function removeOffset(nickname: string): string {
                    return nickname.replace(/\s*\(UTC[+-][\d.]+\)$/i, '').trim();
                }

                function buildNickname(base: string, offsetStr: string): string {
                    const candidate = `${base} (${offsetStr})`;
                    if (candidate.length <= 32) return candidate;
                    const maxBase = 32 - offsetStr.length - 3;
                    return `${base.substring(0, maxBase)} (${offsetStr})`;
                }

                const dt = DateTime.now().setZone(timezone);
                const newOffset = offsetToString(dt.offset);

                const results: Array<{
                    serverId: string;
                    serverName: string;
                    status: string;
                    oldNickname?: string;
                    newNickname?: string;
                    message?: string;
                }> = [];

                let updatedCount = 0;

                for (const serverId of userServers) {
                    try {
                        const guild = c.guilds.cache.get(serverId);
                        if (!guild) continue;

                        const member = await guild.members.fetch(userId).catch(() => null);
                        if (!member) continue;

                        if (guild.ownerId === userId) {
                            results.push({ serverId, serverName: guild.name, status: 'skipped_owner' });
                            continue;
                        }

                        if (!member.manageable) {
                            results.push({ serverId, serverName: guild.name, status: 'skipped_permissions' });
                            continue;
                        }

                        const currentNickname = member.nickname ?? member.user.username;
                        const cleanBase = removeOffset(currentNickname);
                        const newNickname = buildNickname(cleanBase, newOffset);

                        if (newNickname !== currentNickname) {
                            await member.setNickname(newNickname);
                            results.push({
                                serverId,
                                serverName: guild.name,
                                status: 'updated',
                                oldNickname: currentNickname,
                                newNickname,
                            });
                            updatedCount++;
                        } else {
                            results.push({ serverId, serverName: guild.name, status: 'no_change' });
                        }
                    } catch (error) {
                        results.push({
                            serverId,
                            serverName: 'Unknown',
                            status: 'error',
                            message: error instanceof Error ? error.message : String(error),
                        });
                    }
                }

                return { shardId: c.shard?.ids[0] ?? 0, updatedCount, results };
            },
            { context: { userId, userServers, timezone } },
        ) as ShardUpdateResult[];

        let total = 0;

        for (const shard of shardResults) {
            total += shard.updatedCount;
            for (const r of shard.results) {
                if (r.status === 'updated' && r.oldNickname && r.newNickname) {
                    console.log(`📝 DST: ${userId} in ${r.serverName}: "${r.oldNickname}" → "${r.newNickname}"`);
                    await this.logger.logNicknameUpdate(userId, r.serverId, r.oldNickname, r.newNickname);
                }
            }
        }

        return total;
    }
}
