import type {
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    MessageCreateOptions,
    ClientEvents,
} from 'discord.js';
import type { SlashCommandBuilder } from 'discord.js';

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface UserTimezone {
    user_id: string;
    timezone_identifier: string;
    created_at: string;
}

export interface TimezoneOption {
    name: string;
    value: string;
}

export interface TimeInfo {
    timezone: string;
    time: string;
    date: string;
    fullDateTime: string;
    offset: string;
    dayName: string;
    monthName: string;
    formatted: string;
}

export interface BotStats {
    totalUsers: number;
    totalConnections: number;
    popularTimezones: Array<{ timezone_identifier: string; count: number }>;
}

export interface SchedulerStatus {
    isRunning: boolean;
    hasInterval: boolean;
    nextCheck: string;
}

// Result types returned across the broadcastEval boundary (plain data only)
export type UpdateResultStatus = 'updated' | 'no_change' | 'skipped_owner' | 'skipped_permissions' | 'error';

export interface UpdateResult {
    serverId: string;
    serverName: string;
    status: UpdateResultStatus;
    oldNickname?: string;
    newNickname?: string;
    message?: string;
}

export interface ShardUpdateResult {
    shardId: number;
    updatedCount: number;
    results: UpdateResult[];
}

// ─── Service interfaces ───────────────────────────────────────────────────────

export interface ITimezoneService {
    isValidTimezone(timezone: string): boolean;
    getCurrentOffset(timezone: string): string;
    getCurrentTime(timezone: string): TimeInfo | null;
    formatNicknameWithTimezone(currentNickname: string | null, timezone: string, username: string): string | null;
    removeTimezoneFromNickname(nickname: string): string;
    hasTimezoneInfo(nickname: string): boolean;
    searchTimezones(query: string): TimezoneOption[];
}

export interface IDatabaseService {
    getUserTimezone(userId: string): UserTimezone | null;
    setUserTimezone(userId: string, timezone: string): void;
    deleteUser(userId: string): void;
    addUserToServer(userId: string, serverId: string): void;
    getUserServers(userId: string): string[];
    getUsersInTimezone(timezone: string): string[];
    getAllActiveTimezones(): string[];
    getStats(): BotStats;
}

export interface IClientProvider {
    setClient(client: import('discord.js').Client): void;
    getClient(): import('discord.js').Client;
    hasClient(): boolean;
}

export interface ILogger {
    log(message: string | MessageCreateOptions): Promise<string | null>;
    error(message: string | MessageCreateOptions): Promise<string | null>;
    logCommand(command: string, userId: string, serverId: string, status: string): Promise<void>;
    logTimezoneSet(userId: string, serverId: string, timezone: string, offset: string): Promise<void>;
    logNicknameUpdate(userId: string, serverId: string, oldNickname: string, newNickname: string): Promise<void>;
    logDSTChange(timezone: string, affectedUsers: number, newOffset: string): Promise<void>;
    logPermissionError(userId: string, serverId: string, action: string): Promise<void>;
}

export interface IDSTDetector {
    /** Returns the new UTC offset string if DST changed at 5am in the given timezone, null otherwise. */
    getDSTChange(timezone: string): string | null;
}

export interface IDSTUpdater {
    /** Updates nicknames for a user across all their servers. Returns count of servers updated. */
    updateUserNicknames(userId: string, timezone: string, userServers: string[]): Promise<number>;
}

export interface IDSTScheduler {
    start(): void;
    stop(): void;
    getStatus(): SchedulerStatus;
}

// ─── Discord infrastructure types ────────────────────────────────────────────

export interface Command {
    // discord.js addSubcommand returns a narrowed builder type — accept any builder shape
    data: { name: string; toJSON(): unknown };
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
    autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export interface DiscordEvent<K extends keyof ClientEvents = keyof ClientEvents> {
    name: K;
    once?: boolean;
    execute(...args: ClientEvents[K]): Promise<void>;
}
