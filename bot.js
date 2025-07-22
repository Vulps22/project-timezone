require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const database = require('./config/database');
const EventHandler = require('./handlers/eventHandler');
const { clientProvider } = require('./services/clientProvider');

class TimezoneBot {
    constructor() {
        // Initialize Discord client with required intents
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers, // Privileged intent - now enabled in Discord Developer Portal
                GatewayIntentBits.DirectMessages
            ]
        });

        this.eventHandler = new EventHandler(this.client);
    }

    async start() {
        try {
            const shardId = this.client.shard?.ids[0] ?? 0;
            console.log(`🚀 Starting Timey Zoney shard ${shardId}...`);
            
            // Set client in provider for cross-module access
            clientProvider.setClient(this.client);
            
            // Connect to database (each shard shares the same SQLite file)
            await database.connect();
            
            // Register event handlers
            this.eventHandler.registerEvents();
            
            // Login to Discord
            await this.client.login(process.env.DISCORD_TOKEN);
            
        } catch (error) {
            console.error('❌ Failed to start bot shard:', error);
            process.exit(1);
        }
    }

    async shutdown() {
        try {
            const shardId = this.client.shard?.ids[0] ?? 0;
            console.log(`🛑 Shutting down Timey Zoney shard ${shardId}...`);
            
            // Close Discord client
            if (this.client) {
                await this.client.destroy();
                console.log(`Discord client disconnected for shard ${shardId}`);
            }
            
            // Close database connection
            await database.close();
            
            console.log(`✅ Timey Zoney shard ${shardId} shutdown complete`);
            process.exit(0);
        } catch (error) {
            console.error('❌ Error during shard shutdown:', error);
            process.exit(1);
        }
    }
}

// Create bot instance
const bot = new TimezoneBot();

// Handle graceful shutdown
process.on('SIGINT', () => bot.shutdown());
process.on('SIGTERM', () => bot.shutdown());

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    bot.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    bot.shutdown();
});

// Start the bot
bot.start();
