import type { MessageCreateOptions } from 'discord.js';
import type { ILogger, IClientProvider } from '../types';
import { config, ConfigOption } from '../config/config';

export class Logger implements ILogger {
    constructor(private readonly clientProvider: IClientProvider) {}

    async log(message: string | MessageCreateOptions): Promise<string | null> {
        const channelId = config.get(ConfigOption.DISCORD_LOG_CHANNEL);
        return this.sendTo(message, channelId);
    }

    async error(message: string | MessageCreateOptions): Promise<string | null> {
        const channelId = config.get(ConfigOption.DISCORD_ERROR_CHANNEL);
        return this.sendTo(message, channelId);
    }

    async logCommand(command: string, userId: string, serverId: string, status: string): Promise<void> {
        await this.log(
            `**Command:** ${command} | **User:** <@${userId}> (\`${userId}\`) | **Server:** \`${serverId}\` - ${status}`,
        );
    }

    async logTimezoneSet(userId: string, serverId: string, timezone: string, offset: string): Promise<void> {
        await this.logCommand('timezone', userId, serverId, `Timezone set to ${timezone} (${offset})`);
    }

    async logNicknameUpdate(userId: string, serverId: string, old_: string, new_: string): Promise<void> {
        await this.log(
            `**Nickname Update** | **User:** <@${userId}> (\`${userId}\`) | **Server:** \`${serverId}\` - \`${old_}\` → \`${new_}\``,
        );
    }

    async logDSTChange(timezone: string, affectedUsers: number, newOffset: string): Promise<void> {
        await this.log(
            `**DST Change** | **Timezone:** \`${timezone}\` | **Affected:** ${affectedUsers} | **New Offset:** ${newOffset}`,
        );
    }

    async logPermissionError(userId: string, serverId: string, action: string): Promise<void> {
        await this.error(
            `**Permission Error** | **User:** <@${userId}> (\`${userId}\`) | **Server:** \`${serverId}\` - Failed to ${action}`,
        );
    }

    private async sendTo(
        messageOptions: string | MessageCreateOptions,
        channelId: string | undefined,
    ): Promise<string | null> {
        if (!channelId) {
            return this.sendWebhook(messageOptions);
        }

        const payload: MessageCreateOptions =
            typeof messageOptions === 'string' ? { content: messageOptions } : messageOptions;

        try {
            let client;
            try {
                client = this.clientProvider.getClient();
            } catch {
                return this.sendWebhook(payload);
            }

            const results = await client.shard!.broadcastEval(
                async (c, { channelId, payload }) => {
                    const channel = c.channels.cache.get(channelId);
                    // PartialGroupDMChannel lacks send(); guard with isSendable
                    if (channel && 'send' in channel) {
                        try {
                            const msg = await (channel as import('discord.js').TextChannel).send(
                                payload as import('discord.js').MessageCreateOptions,
                            );
                            return msg.id ?? null;
                        } catch {
                            return null;
                        }
                    }
                    return null;
                },
                { context: { channelId, payload } },
            ) as Array<string | null>;

            return results.find(id => id !== null) ?? null;
        } catch (err) {
            console.error('Logger.sendTo failed:', err);
            return null;
        }
    }

    private async sendWebhook(messageOptions: string | MessageCreateOptions): Promise<null> {
        const webhookUrl = config.get(ConfigOption.DISCORD_LOGGER_WEBHOOK);
        if (!webhookUrl) return null;

        const body = typeof messageOptions === 'string'
            ? { content: messageOptions }
            : messageOptions;

        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch (err) {
            console.error('Webhook fallback failed:', err);
        }
        return null;
    }
}
