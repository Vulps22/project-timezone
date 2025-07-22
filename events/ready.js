const { Events } = require('discord.js');
const { logger } = require('../utils/logger');

module.exports = {
    name: Events.ClientReady,
    once: true,
    /**
     * @param {Client} client
     */
    async execute(client) {
        try {
            const shardId = client.shard?.ids[0] ?? 0;
            const totalShards = client.shard?.count ?? 1;
            
            console.log(`✅ Timey Zoney shard ${shardId}/${totalShards} (${client.user.tag}) is online and ready!`);
            console.log(`📊 Shard ${shardId} serving ${client.guilds.cache.size} servers`);
            console.log(`👥 Shard ${shardId} watching ${client.users.cache.size} users`);
            
            // Set bot status
            client.user.setActivity(`timezones | Shard ${shardId}/${totalShards}`, { type: 'WATCHING' });
            
            // Register slash commands
            await registerCommands(client);
            
            // Log bot startup (only from shard 0 to avoid spam)
            if (shardId === 0) {
                await logger.log(`🚀 **Timey Zoney** started with ${totalShards} shard(s) | Total servers: ${client.guilds.cache.size}`);
            }
            
        } catch (error) {
            console.error('❌ Error in ready event:', error);
            await logger.error(`**Ready Event Error** | **Error:** ${error.message}`);
        }
    },
};

/**
 * Register slash commands with Discord
 * @param {Client} client
 */
async function registerCommands(client) {
    const { REST, Routes } = require('discord.js');
    
    if (!client.commands || client.commands.size === 0) {
        console.warn('⚠️ No commands to register');
        return;
    }

    const commandData = Array.from(client.commands.values()).map(command => {
        const data = command.data.toJSON();
        console.log(`🔧 Command: ${data.name}`);
        
        // Log autocomplete options
        if (data.options) {
            data.options.forEach(option => {
                if (option.autocomplete) {
                    console.log(`  ✨ Autocomplete enabled for option: ${option.name}`);
                }
                if (option.options) {
                    option.options.forEach(subOption => {
                        if (subOption.autocomplete) {
                            console.log(`    ✨ Autocomplete enabled for sub-option: ${subOption.name} in ${option.name}`);
                        }
                    });
                }
            });
        }
        
        return data;
    });

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    
    try {
        const shardId = client.shard?.ids[0] ?? 0;
        console.log(`🔄 Shard ${shardId}: Refreshing ${commandData.length} slash commands...`);
        
        // Register commands globally
        const data = await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandData }
        );
        
        console.log(`✅ Shard ${shardId}: Successfully registered ${data.length} slash commands`);
        
        // Log command registration (only from shard 0 to avoid spam)
        if (shardId === 0) {
            const commandNames = commandData.map(cmd => cmd.name).join(', ');
            await logger.log(`🔧 **Commands Registered** | **Commands:** \`${commandNames}\` | **Count:** ${data.length}`);
        }
        
    } catch (error) {
        console.error('❌ Error registering slash commands:', error);
        await logger.error(`**Command Registration Error** | **Error:** ${error.message}`);
    }
}
