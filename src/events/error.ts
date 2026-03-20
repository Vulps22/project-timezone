import { Events } from 'discord.js';
import type { DiscordEvent } from '../types';
import { logger } from '../bot';

const event: DiscordEvent<typeof Events.Error> = {
    name: Events.Error,

    async execute(error: Error) {
        console.error('❌ Discord client error:', error);
        await logger.error(`**Client Error** | ${error.message}`);
    },
};

export default event;
