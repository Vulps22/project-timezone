const { Events, MessageFlags, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { logger } = require('../utils/logger');

module.exports = {
    name: Events.InteractionCreate,
    /**
     * @param {Interaction} interaction
     */
    async execute(interaction) {
        try {
            if (interaction.isAutocomplete()) {
                console.log('🔍 Autocomplete interaction received:', interaction.commandName);
                await handleAutocomplete(interaction);
                return;
            }

            if (interaction.isChatInputCommand()) {
                console.log('⚡ Command interaction received:', interaction.commandName, interaction.user.tag);
                
                // Check permissions before executing command
                const permissionsCheck = await checkBotPermissions(interaction);
                if (!permissionsCheck.hasPermissions) {
                    await sendPermissionsError(interaction, permissionsCheck.missingPermissions);
                    return;
                }
                
                await handleCommand(interaction);
                return;
            }

            // Handle other interaction types as needed
            console.log('⚠️ Unhandled interaction type:', interaction.type);

        } catch (error) {
            console.error('❌ Error in interactionCreate:', error);
            await logger.error(`**Interaction Error** | **Type:** ${interaction.type} | **Command:** ${interaction.commandName || 'N/A'} | **User:** <@${interaction.user.id}> | **Error:** ${error.message}`);
        }
    },
};

/**
 * Handle autocomplete interactions
 * @param {AutocompleteInteraction} interaction
 */
async function handleAutocomplete(interaction) {
    const { client } = interaction;
    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`❌ No command matching ${interaction.commandName} was found for autocomplete.`);
        return;
    }

    if (!command.autocomplete) {
        console.error(`❌ Command ${interaction.commandName} has no autocomplete handler.`);
        return;
    }

    try {
        await command.autocomplete(interaction);
        console.log(`✅ Autocomplete for ${interaction.commandName} completed`);
    } catch (error) {
        console.error(`❌ Autocomplete error for ${interaction.commandName}:`, error);
        // Don't reply to autocomplete errors - Discord handles this
    }
}

/**
 * Handle command interactions
 * @param {ChatInputCommandInteraction} interaction
 */
async function handleCommand(interaction) {
    const { client } = interaction;
    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`❌ No command matching ${interaction.commandName} was found.`);
        
        // Only try to reply if interaction is still valid
        if (interaction.isRepliable()) {
            try {
                await interaction.reply({
                    content: '❌ Command not found.',
                    flags: [MessageFlags.Ephemeral]
                });
            } catch (replyError) {
                console.error('❌ Failed to reply with command not found error:', replyError.code || replyError.message);
            }
        }
        return;
    }

    try {
        await command.execute(interaction);
        console.log(`✅ Command /${interaction.commandName} executed successfully`);
    } catch (error) {
        console.error(`❌ Command execution error for ${interaction.commandName}:`, error);
        
        // Check error type and interaction state before attempting reply
        const isUnknownInteraction = error.code === 10062;
        const isAlreadyAcknowledged = error.code === 40060;
        
        if (isUnknownInteraction) {
            console.log('⚠️ Unknown interaction - likely timed out or invalid. Skipping error reply.');
            return;
        }
        
        if (isAlreadyAcknowledged) {
            console.log('⚠️ Interaction already acknowledged. Skipping error reply.');
            return;
        }
        
        // Only attempt error reply for valid, unacknowledged interactions
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            try {
                const errorMessage = '❌ There was an error while executing this command!';
                await interaction.reply({ 
                    content: errorMessage, 
                    flags: [MessageFlags.Ephemeral] 
                });
            } catch (replyError) {
                console.error('❌ Failed to send error reply:', replyError.code || replyError.message);
            }
        }
    }
}

/**
 * Check the bot has the permissions the command declares in `botPermissions`.
 * Uses appPermissions (resolved for this channel by Discord) so it works even
 * when the guild isn't cached.
 * @param {ChatInputCommandInteraction} interaction
 * @returns {Object} Permission check result
 */
async function checkBotPermissions(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);
    const requiredPermissions = command?.botPermissions ?? [];

    if (!interaction.inGuild() || !interaction.appPermissions || requiredPermissions.length === 0) {
        return { hasPermissions: true, missingPermissions: [] };
    }

    const missingPermissions = requiredPermissions.filter(permission => !interaction.appPermissions.has(permission));

    return {
        hasPermissions: missingPermissions.length === 0,
        missingPermissions
    };
}

/**
 * Send a detailed permissions error message
 * @param {ChatInputCommandInteraction} interaction
 * @param {Array} missingPermissions
 */
async function sendPermissionsError(interaction, missingPermissions) {
    const permissionNames = {
        [PermissionsBitField.Flags.ManageNicknames]: 'Manage Nicknames',
        [PermissionsBitField.Flags.ViewChannel]: 'View Channel',
        [PermissionsBitField.Flags.SendMessages]: 'Send Messages',
        [PermissionsBitField.Flags.UseSlashCommands]: 'Use Slash Commands'
    };

    const missingPermissionsList = missingPermissions
        .map(perm => `• ${permissionNames[perm] || 'Unknown Permission'}`)
        .join('\n');

    const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🚫 Missing Permissions')
        .setDescription('I need additional permissions to work properly in this server.')
        .addFields(
            {
                name: '❌ Missing Permissions',
                value: missingPermissionsList,
                inline: false
            },
            {
                name: '🔧 How to Fix',
                value: '1. Go to **Server Settings** → **Roles**\n2. Find the **Timey Zoney** role\n3. Enable the missing permissions above\n4. Try the command again',
                inline: false
            },
            {
                name: '❓ Why I Need These',
                value: '• **Manage Nicknames**: To add timezone info to your nickname\n• **View Channel**: To see and respond to commands\n• **Send Messages**: To send command responses\n• **Use Slash Commands**: To register and use commands',
                inline: false
            }
        )
        .setFooter({ text: 'These permissions are required for timezone functionality' });

    try {
        // Send as non-ephemeral so admins can see it
        await interaction.reply({ embeds: [embed] });
        console.log(`⚠️ Sent permissions error for ${missingPermissions.length} missing permissions in ${interaction.guild.name}`);
    } catch (error) {
        console.error('❌ Failed to send permissions error:', error);
        
        // Fallback to simple text message
        try {
            await interaction.reply({
                content: `🚫 **Missing Permissions**\n\nI need these permissions to work:\n${missingPermissionsList}\n\nPlease ask an admin to grant these permissions to the Timey Zoney role.`
            });
        } catch (fallbackError) {
            console.error('❌ Failed to send fallback permissions error:', fallbackError);
        }
    }
}
