const { Events } = require('discord.js');
const { logger } = require('../utils/logger');

class EventHandler {
    constructor(client) {
        this.client = client;
    }

    registerEvents() {
        // Bot ready event
        this.client.once(Events.ClientReady, this.onReady.bind(this));
        
        // Guild member events
        this.client.on(Events.GuildMemberAdd, this.onGuildMemberAdd.bind(this));
        this.client.on(Events.GuildMemberUpdate, this.onGuildMemberUpdate.bind(this));
        
        // Interaction events
        this.client.on(Events.InteractionCreate, this.onInteractionCreate.bind(this));

        // Error handling
        this.client.on(Events.Error, this.onError.bind(this));
    }

    onReady(client) {
        const shardId = client.shard?.ids[0] ?? 0;
        const totalShards = client.shard?.count ?? 1;
        
        console.log(`✅ Timey Zoney shard ${shardId}/${totalShards} (${client.user.tag}) is online and ready!`);
        console.log(`📊 Shard ${shardId} serving ${client.guilds.cache.size} servers`);
        console.log(`👥 Shard ${shardId} watching ${client.users.cache.size} users`);
        
        // Set bot status
        client.user.setActivity(`timezones | Shard ${shardId}/${totalShards}`, { type: 'WATCHING' });
        
        // Log bot startup (only from shard 0 to avoid spam)
        if (shardId === 0) {
            logger.log(`🚀 **Timey Zoney** started with ${totalShards} shard(s) | Total servers: ${client.guilds.cache.size}`);
        }
    }

    async onGuildMemberAdd(member) {
        try {
            console.log(`👋 User ${member.user.tag} joined ${member.guild.name}`);
            
            // Log new member join
            logger.log(`**New Member** | **User:** <@${member.user.id}> (\`${member.user.tag}\`) | **Server:** \`${member.guild.name}\` (\`${member.guild.id}\`) - Joined server`);
            
            // TODO: Check if user has timezone set and update nickname immediately
            // This will be implemented when we create the nickname handler
            
        } catch (error) {
            console.error('Error handling guild member add:', error);
        }
    }

    async onGuildMemberUpdate(oldMember, newMember) {
        try {
            // Check if nickname changed
            if (oldMember.nickname !== newMember.nickname) {
                console.log(`👤 ${newMember.user.tag} changed nickname in ${newMember.guild.name}`);
                console.log(`   Old: ${oldMember.nickname || oldMember.user.username}`);
                console.log(`   New: ${newMember.nickname || newMember.user.username}`);
                
                // TODO: Check if timezone info was removed and re-apply if needed
                // This will be implemented when we create the nickname handler
            }
        } catch (error) {
            console.error('Error handling guild member update:', error);
        }
    }

    async onInteractionCreate(interaction) {
        try {
            if (!interaction.isChatInputCommand()) return;

            console.log(`🔧 Command used: /${interaction.commandName} by ${interaction.user.tag}`);
            
            // TODO: Handle command routing
            // This will be implemented when we create the command handler
            
        } catch (error) {
            console.error('Error handling interaction:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your command.',
                    ephemeral: true
                });
            }
        }
    }

    onError(error) {
        console.error('Discord client error:', error);
    }
}

module.exports = EventHandler;
