import { Events, REST, Routes, ActivityType } from 'discord.js';
import type { Client } from 'discord.js';
import type { DiscordEvent } from '../types';
import { logger } from '../bot';

const event: DiscordEvent<typeof Events.ClientReady> = {
    name: Events.ClientReady,
    once: true,

    async execute(client: Client<true>) {
        const shardId = client.shard?.ids[0] ?? 0;
        const totalShards = client.shard?.count ?? 1;

        console.log(`✅ Shard ${shardId}/${totalShards} (${client.user.tag}) ready`);
        console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);

        client.user.setActivity(`timezones | Shard ${shardId}/${totalShards}`, {
            type: ActivityType.Watching,
        });

        await registerCommands(client);

        if (shardId === 0) {
            await logger.log(
                `🚀 **Timey Zoney** started | ${totalShards} shard(s) | ${client.guilds.cache.size} server(s)`,
            );
        }
    },
};

async function registerCommands(client: Client<true>): Promise<void> {
    if (!client.commands?.size) {
        console.warn('⚠️ No commands to register');
        return;
    }

    const commandData = Array.from(client.commands.values()).map(c => c.data.toJSON());
    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
    const shardId = client.shard?.ids[0] ?? 0;

    try {
        console.log(`🔄 Shard ${shardId}: registering ${commandData.length} command(s)...`);
        const data = await rest.put(Routes.applicationCommands(client.user.id), { body: commandData }) as unknown[];
        console.log(`✅ Shard ${shardId}: registered ${data.length} command(s)`);
    } catch (err) {
        console.error('❌ Command registration failed:', err);
    }
}

export default event;
