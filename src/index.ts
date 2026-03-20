import 'dotenv/config';
import { ShardingManager } from 'discord.js';
import path from 'path';

const botFile = path.join(__dirname, 'bot.js'); // compiled output

const manager = new ShardingManager(botFile, {
    token: process.env.DISCORD_TOKEN,
    totalShards: 'auto',
});

manager.on('shardCreate', shard => {
    console.log(`🚀 Launched shard ${shard.id}`);
    shard.on('ready', () => console.log(`✅ Shard ${shard.id} ready`));
    shard.on('disconnect', () => console.log(`⚠️ Shard ${shard.id} disconnected`));
    shard.on('reconnecting', () => console.log(`🔄 Shard ${shard.id} reconnecting`));
    shard.on('death', () => console.log(`💀 Shard ${shard.id} died`));
});

console.log('🌐 Starting Timey Zoney...');
manager.spawn().catch(err => {
    console.error('❌ Failed to spawn shards:', err);
    process.exit(1);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
