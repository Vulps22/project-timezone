const { Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

class CommandHandler {
    constructor(client) {
        this.client = client;
        this.commands = new Collection();
        this.loadCommands();
        
        // Add commands to client for global access
        this.client.commands = this.commands;
    }

    /**
     * Load all command files
     */
    loadCommands() {
        const commandsPath = path.join(__dirname, '../commands');
        
        if (!fs.existsSync(commandsPath)) {
            console.error('❌ Commands directory not found');
            return;
        }

        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            try {
                const command = require(filePath);
                
                if ('data' in command && 'execute' in command) {
                    this.commands.set(command.data.name, command);
                    console.log(`✅ Loaded command: ${command.data.name}`);
                } else {
                    console.warn(`⚠️ Command ${file} is missing required 'data' or 'execute' property`);
                }
            } catch (error) {
                console.error(`❌ Error loading command ${file}:`, error);
            }
        }
        
        console.log(`📋 Loaded ${this.commands.size} command(s)`);
    }

    /**
     * Get command statistics
     * @returns {Object} Command statistics
     */
    getStats() {
        return {
            totalCommands: this.commands.size,
            commandNames: Array.from(this.commands.keys())
        };
    }

    /**
     * Reload a specific command
     * @param {string} commandName - Name of command to reload
     * @returns {boolean} Success status
     */
    reloadCommand(commandName) {
        try {
            const commandsPath = path.join(__dirname, '../commands');
            const commandFile = `${commandName}.js`;
            const filePath = path.join(commandsPath, commandFile);
            
            if (!fs.existsSync(filePath)) {
                console.error(`❌ Command file ${commandFile} not found`);
                return false;
            }
            
            // Delete from require cache
            delete require.cache[require.resolve(filePath)];
            
            // Reload the command
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                this.commands.set(command.data.name, command);
                console.log(`✅ Reloaded command: ${command.data.name}`);
                return true;
            } else {
                console.error(`❌ Command ${commandFile} is missing required properties`);
                return false;
            }
        } catch (error) {
            console.error(`❌ Error reloading command ${commandName}:`, error);
            return false;
        }
    }
}

module.exports = CommandHandler;
