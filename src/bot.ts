import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { createDatabase } from './config/database';
import { DatabaseService } from './services/DatabaseService';
import { TimezoneService } from './services/TimezoneService';
import { ClientProvider } from './services/ClientProvider';
import { DSTDetector } from './services/dst/DSTDetector';
import { DSTUpdater } from './services/dst/DSTUpdater';
import { DSTScheduler } from './services/dst/DSTScheduler';
import { Logger } from './utils/Logger';
import { CommandHandler } from './handlers/CommandHandler';
import { EventLoader } from './handlers/EventLoader';

// ─── Composition root ─────────────────────────────────────────────────────────
// All singletons are created once per shard process and exported for use by
// commands and event handlers. No module requires its own dependencies.

const sqliteDb = createDatabase();
export const db = new DatabaseService(sqliteDb);
export const timezoneService = new TimezoneService();
export const clientProvider = new ClientProvider();
export const logger = new Logger(clientProvider);

// ─── Bot class ────────────────────────────────────────────────────────────────

class TimezoneBot {
    private readonly client: Client;
    private readonly dstScheduler: DSTScheduler;

    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.DirectMessages,
            ],
        });

        const dstDetector = new DSTDetector();
        const dstUpdater = new DSTUpdater(clientProvider, logger);
        this.dstScheduler = new DSTScheduler(dstDetector, dstUpdater, db, logger);

        clientProvider.setClient(this.client);

        new CommandHandler(this.client);
        new EventLoader(this.client);
    }

    async start(): Promise<void> {
        const shardId = this.client.shard?.ids[0] ?? 0;
        console.log(`🚀 Starting shard ${shardId}...`);

        await this.client.login(process.env.DISCORD_TOKEN);

        // Only shard 0 runs the DST scheduler to avoid duplicate updates
        if (shardId === 0) {
            setTimeout(() => {
                this.dstScheduler.start();
                console.log(`🌍 DST Scheduler started on shard ${shardId}`);
            }, 10_000);
        }
    }

    async shutdown(): Promise<void> {
        this.dstScheduler.stop();
        await this.client.destroy();
        sqliteDb.close();
        console.log('✅ Bot shutdown complete');
    }
}

const bot = new TimezoneBot();

process.on('SIGINT', () => bot.shutdown().then(() => process.exit(0)));
process.on('SIGTERM', () => bot.shutdown().then(() => process.exit(0)));
process.on('uncaughtException', err => { console.error('Uncaught:', err); bot.shutdown().then(() => process.exit(1)); });
process.on('unhandledRejection', reason => { console.error('Unhandled rejection:', reason); });

bot.start().catch(err => { console.error('❌ Failed to start:', err); process.exit(1); });
