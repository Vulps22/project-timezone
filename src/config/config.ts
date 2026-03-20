export const ConfigOption = {
    DISCORD_TOKEN: 'DISCORD_TOKEN',
    DISCORD_LOG_CHANNEL: 'DISCORD_LOG_CHANNEL',
    DISCORD_ERROR_CHANNEL: 'DISCORD_ERROR_CHANNEL',
    DISCORD_LOGGER_WEBHOOK: 'DISCORD_LOGGER_WEBHOOK',
    NODE_ENV: 'NODE_ENV',
} as const;

export type ConfigOptionKey = typeof ConfigOption[keyof typeof ConfigOption];

class Config {
    private values = new Map<string, string>();

    constructor() {
        this.loadFromEnv();
    }

    private loadFromEnv(): void {
        for (const key of Object.values(ConfigOption)) {
            const value = process.env[key];
            if (value) this.values.set(key, value);
        }
    }

    get(option: ConfigOptionKey): string | undefined {
        return this.values.get(option);
    }

    require(option: ConfigOptionKey): string {
        const value = this.values.get(option);
        if (!value) throw new Error(`Missing required config: ${option}`);
        return value;
    }

    has(option: ConfigOptionKey): boolean {
        return this.values.has(option);
    }
}

export const config = new Config();
