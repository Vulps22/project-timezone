require('dotenv').config();
const { ShardingManager } = require('discord.js');
const path = require('path');

// Create sharding manager
const manager = new ShardingManager(path.join(__dirname, 'bot.js'), {
    token: process.env.DISCORD_TOKEN,
    totalShards: 'auto' // Discord will determine optimal shard count
});

// Shard events
manager.on('shardCreate', shard => {
    console.log(`🚀 Launched shard ${shard.id}`);
    
    shard.on('ready', () => {
        console.log(`✅ Shard ${shard.id} is ready`);
    });
    
    shard.on('disconnect', () => {
        console.log(`⚠️ Shard ${shard.id} disconnected`);
    });
    
    shard.on('reconnecting', () => {
        console.log(`🔄 Shard ${shard.id} reconnecting`);
    });
    
    shard.on('death', () => {
        console.log(`💀 Shard ${shard.id} died`);
    });
});

// Start all shards
console.log('🌐 Starting Timey Zoney with sharding support...');
manager.spawn();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down all shards...');
    await manager.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down all shards...');
    await manager.destroy();
    process.exit(0);
});
