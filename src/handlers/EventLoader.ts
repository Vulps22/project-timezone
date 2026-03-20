import fs from 'fs';
import path from 'path';
import type { Client } from 'discord.js';
import type { DiscordEvent } from '../types';

export class EventLoader {
    constructor(private readonly client: Client) {
        this.loadEvents();
    }

    private loadEvents(): void {
        const eventsPath = path.join(__dirname, '../events');
        if (!fs.existsSync(eventsPath)) {
            console.error('❌ Events directory not found');
            return;
        }

        const files = fs
            .readdirSync(eventsPath)
            .filter(f => f.endsWith('.ts') || f.endsWith('.js'));

        for (const file of files) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const mod = require(path.join(eventsPath, file));
                const event: DiscordEvent = mod.default ?? mod;

                if (!event.name || !event.execute) {
                    console.warn(`⚠️ ${file} missing name or execute`);
                    continue;
                }

                if (event.once) {
                    this.client.once(event.name, (...args) => event.execute(...args as Parameters<typeof event.execute>));
                } else {
                    this.client.on(event.name, (...args) => event.execute(...args as Parameters<typeof event.execute>));
                }

                console.log(`✅ Loaded event: ${event.name}`);
            } catch (err) {
                console.error(`❌ Error loading event ${file}:`, err);
            }
        }
    }
}
