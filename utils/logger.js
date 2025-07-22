const { MessageCreateOptions, Channel, Snowflake } = require('discord.js');
const { config, ConfigOption } = require('../config/config.js');
const { clientProvider } = require('../services/clientProvider');

const logger = {

    /**
     * Logs a message to the log channel across shards.
     * @param {MessageCreateOptions | string} messageOptions
     * @returns {Promise<string|null>} - Resolves with the message ID if sent successfully, or null if unsuccessful.
     */
    async log(messageOptions) {
        if (!messageOptions) {
            console.error('Message options must be provided.');
            return null;
        }

        const channelId = config.get(ConfigOption.DISCORD_LOG_CHANNEL);
        return await sendTo(messageOptions, channelId);
    },

    /**
     * Edits a previously sent log message
     * @param {string} messageId
     * @param {MessageCreateOptions | string} messageOptions
     * @returns {Promise<boolean|null>}
     */
    async editLog(messageId, messageOptions) {
        if (!messageId || !messageOptions) {
            console.error('Message ID and message options must be provided.');
            return null;
        }

        const channelId = config.get(ConfigOption.DISCORD_LOG_CHANNEL);
        return await sendEdit(channelId, messageId, messageOptions);
    },

    /**
     * Logs an error message to the error channel
     * @param {MessageCreateOptions | string} messageOptions
     * @returns {Promise<string|null>}
     */
    async error(messageOptions) {
        if (!messageOptions) {
            console.error('Message options must be provided.');
            return null;
        }

        const channelId = config.get(ConfigOption.DISCORD_ERROR_CHANNEL);
        return await sendTo(messageOptions, channelId);
    },

    /**
     * Helper function to format command usage logs
     * @param {string} command - Command name
     * @param {string} userId - Discord user ID
     * @param {string} serverId - Discord server ID
     * @param {string} status - Status message (e.g., "Received", "Timezone set to UTC+0")
     * @returns {Promise<string|null>}
     */
    async logCommand(command, userId, serverId, status) {
        const message = `**Command:** ${command} | **User:** <@${userId}> (\`${userId}\`) | **Server:** \`${serverId}\` - ${status}`;
        return await this.log(message);
    },

    /**
     * Helper function to log timezone operations
     * @param {string} userId - Discord user ID
     * @param {string} serverId - Discord server ID
     * @param {string} timezone - Timezone identifier
     * @param {string} offset - UTC offset
     * @returns {Promise<string|null>}
     */
    async logTimezoneSet(userId, serverId, timezone, offset) {
        return await this.logCommand('timezone', userId, serverId, `Timezone set to ${timezone} (${offset})`);
    },

    /**
     * Helper function to log nickname updates
     * @param {string} userId - Discord user ID
     * @param {string} serverId - Discord server ID
     * @param {string} oldNickname - Previous nickname
     * @param {string} newNickname - New nickname
     * @returns {Promise<string|null>}
     */
    async logNicknameUpdate(userId, serverId, oldNickname, newNickname) {
        const message = `**Nickname Update** | **User:** <@${userId}> (\`${userId}\`) | **Server:** \`${serverId}\` - Changed from \`${oldNickname}\` to \`${newNickname}\``;
        return await this.log(message);
    },

    /**
     * Helper function to log DST changes
     * @param {string} timezone - Timezone that changed
     * @param {number} affectedUsers - Number of users affected
     * @param {string} newOffset - New UTC offset
     * @returns {Promise<string|null>}
     */
    async logDSTChange(timezone, affectedUsers, newOffset) {
        const message = `**DST Change** | **Timezone:** \`${timezone}\` | **Affected Users:** ${affectedUsers} | **New Offset:** ${newOffset}`;
        return await this.log(message);
    },

    /**
     * Helper function to log permission errors
     * @param {string} userId - Discord user ID
     * @param {string} serverId - Discord server ID
     * @param {string} action - What action failed
     * @returns {Promise<string|null>}
     */
    async logPermissionError(userId, serverId, action) {
        const message = `**Permission Error** | **User:** <@${userId}> (\`${userId}\`) | **Server:** \`${serverId}\` - Failed to ${action}`;
        return await this.error(message);
    }
};

module.exports = {
    logger
};

/**
 * Sends a message to a specific channel of the support server across shards.
 * @param {MessageCreateOptions | string} messageOptions - The message options (content, embeds, etc.) to be sent.
 * @param {string} channelId - The ID of the channel to send the message to.
 * @returns {Promise<string|null>} - Resolves with the message ID if sent successfully, or null if unsuccessful.
 */
async function sendTo(messageOptions, channelId) {
    if (!channelId) {
        console.error('Channel ID must be provided.');
        return null;
    }

    // if messageOptions is a string, convert it to an object and set content
    if (typeof messageOptions === 'string') messageOptions = { content: messageOptions };

    try {
        let client;
        try {
            client = clientProvider.getClient();
        } catch {
            console.log('Client Not Available: defaulting to log webhook');
            await sendWebhook(messageOptions);
            return null;
        }
        if (!client) {
            console.error('Client instance is not available. Ensure it is set in the provider.');
            return null;
        }

        const result = await client.shard.broadcastEval(
            // eslint-disable-next-line no-shadow
            async (client, { channelId, messageOptions }) => {
                /**
                 * @type {Channel}
                 */
                const channel = client.channels.cache.get(channelId);

                if (channel && channel.isTextBased()) {
                    try {
                        const options = { ...messageOptions, fetchReply: true };
                        const message = await channel.send(options);
                        return message.id;
                    } catch (error) {
                        console.error(`Error sending message in shard ${client.shard.ids[0]} to channel ${channelId}:`, error);
                        return false;
                    }
                }
                return false;
            },
            { context: { channelId, messageOptions } },
        );

        const messageId = result.find(id => id !== false);
        return messageId || null;
    } catch (error) {
        console.error(`Failed to broadcast message to channel ${channelId}:`, error);
        return null;
    }
}

/**
 * Edits a message in a specific channel across shards.
 * @param {Snowflake} channelId
 * @param {Snowflake} messageId
 * @param {MessageCreateOptions | string} messageOptions
 * @returns {Promise<boolean>} - Resolves to true if the message was edited successfully, false otherwise.
 */
async function sendEdit(channelId, messageId, messageOptions) {
    if (!messageId || !messageOptions || !channelId) {
        console.error('Message ID, Channel ID and message options must be provided.');
        return null;
    }

    try {
        const client = clientProvider.getClient();

        if (!client) {
            console.error('Client instance is not available. Ensure it is set in the provider.');
            return null;
        }

        // if messageOptions is a string, convert it to an object and set content
        if (typeof messageOptions === 'string') messageOptions = { content: messageOptions };

        const results = await client.shard.broadcastEval(
            async (client, { channelId, messageId, messageOptions }) => {
                const channel = client.channels.cache.get(channelId);

                if (!channel || !channel.isTextBased()) {
                    return false;
                }

                try {
                    const message = await channel.messages.fetch(messageId);

                    if (message) {
                        await message.edit(messageOptions);
                        return true;
                    }
                } catch (error) {
                    console.error(`Error editing message in shard ${client.shard.ids[0]}:`, error);
                    return false;
                }

                return false;
            }, {
                context: { channelId, messageId, messageOptions }
            },
        );

        return results.some(success => success === true);
    } catch (error) {
        console.error('Error editing message:', error);
        return false;
    }
}

/**
 * Send message via webhook as fallback
 * @param {MessageCreateOptions | string} messageOptions
 * @returns {Promise<boolean|null>}
 */
async function sendWebhook(messageOptions) {
    if (!messageOptions) {
        console.error('Message options must be provided.');
        return null;
    }

    const webhookUrl = config.get(ConfigOption.DISCORD_LOGGER_WEBHOOK);
    if (!webhookUrl) {
        console.error('Webhook URL is not configured.');
        return null;
    }

    try {
        // if messageOptions is a string, convert it to an object and set content
        if (typeof messageOptions === 'string') messageOptions = { content: messageOptions };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageOptions),
        });

        if (!response.ok) {
            console.error(`Failed to send webhook: ${response.status} ${response.statusText}`);
            return null;
        }

        console.log('Webhook sent successfully:', response.status);
        return response.status === 204;

    } catch (error) {
        console.error('Error sending webhook:', error);
        return null;
    }
}
