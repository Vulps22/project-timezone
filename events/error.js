const { Events } = require('discord.js');
const { logger } = require('../utils/logger');

module.exports = {
    name: Events.Error,
    /**
     * @param {Error} error
     */
    async execute(error) {
        console.error('❌ Discord client error:', error);
        await logger.error(`**Discord Client Error** | **Error:** ${error.message}`);
    },
};
