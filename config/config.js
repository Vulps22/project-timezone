const ConfigOption = {
    DISCORD_TOKEN: 'DISCORD_TOKEN',
    DISCORD_LOG_CHANNEL: 'DISCORD_LOG_CHANNEL',
    DISCORD_ERROR_CHANNEL: 'DISCORD_ERROR_CHANNEL',
    DISCORD_LOGGER_WEBHOOK: 'DISCORD_LOGGER_WEBHOOK',
    NODE_ENV: 'NODE_ENV'
};

class Config {
    constructor() {
        this.values = new Map();
        this.loadFromEnv();
    }

    loadFromEnv() {
        // Load values from environment variables
        Object.values(ConfigOption).forEach(option => {
            const value = process.env[option];
            if (value) {
                this.values.set(option, value);
            }
        });
    }

    get(option) {
        return this.values.get(option);
    }

    set(option, value) {
        this.values.set(option, value);
    }

    has(option) {
        return this.values.has(option);
    }
}

const config = new Config();

module.exports = {
    config,
    ConfigOption
};
