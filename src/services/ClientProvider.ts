import type { Client } from 'discord.js';
import type { IClientProvider } from '../types';

export class ClientProvider implements IClientProvider {
    private client: Client | null = null;

    setClient(client: Client): void {
        this.client = client;
    }

    getClient(): Client {
        if (!this.client) {
            throw new Error('Discord client has not been set. Call setClient() first.');
        }
        return this.client;
    }

    hasClient(): boolean {
        return this.client !== null;
    }
}

// Singleton instance shared across the shard process
export const clientProvider = new ClientProvider();
