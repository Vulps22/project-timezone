import { Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import type { Client } from 'discord.js';
import type { Command } from '../types';

// Extend the discord.js Client type to carry our command collection
declare module 'discord.js' {
    interface Client {
        commands: Collection<string, Command>;
    }
}

export class CommandHandler {
    readonly commands: Collection<string, Command> = new Collection();

    constructor(private readonly client: Client) {
        this.loadCommands();
        client.commands = this.commands;
    }

    private loadCommands(): void {
        const commandsPath = path.join(__dirname, '../commands');
        if (!fs.existsSync(commandsPath)) {
            console.error('❌ Commands directory not found');
            return;
        }

        const files = fs
            .readdirSync(commandsPath)
            .filter(f => f.endsWith('.ts') || f.endsWith('.js'));

        for (const file of files) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const mod = require(path.join(commandsPath, file));
                const command: Command = mod.default ?? mod;

                if ('data' in command && 'execute' in command) {
                    this.commands.set(command.data.name, command);
                    console.log(`✅ Loaded command: ${command.data.name}`);
                } else {
                    console.warn(`⚠️ ${file} missing data or execute`);
                }
            } catch (err) {
                console.error(`❌ Error loading command ${file}:`, err);
            }
        }

        console.log(`📋 Loaded ${this.commands.size} command(s)`);
    }
}
