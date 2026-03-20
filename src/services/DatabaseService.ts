import type { Database } from 'better-sqlite3';
import type { IDatabaseService, UserTimezone, BotStats } from '../types';

export class DatabaseService implements IDatabaseService {
    constructor(private readonly db: Database) {}

    getUserTimezone(userId: string): UserTimezone | null {
        return (
            this.db
                .prepare('SELECT * FROM users WHERE user_id = ?')
                .get(userId) as UserTimezone | undefined
        ) ?? null;
    }

    setUserTimezone(userId: string, timezone: string): void {
        this.db
            .prepare(`
                INSERT INTO users (user_id, timezone_identifier, created_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET timezone_identifier = excluded.timezone_identifier
            `)
            .run(userId, timezone);
    }

    deleteUser(userId: string): void {
        this.db.transaction(() => {
            this.db.prepare('DELETE FROM user_servers WHERE user_id = ?').run(userId);
            this.db.prepare('DELETE FROM users WHERE user_id = ?').run(userId);
        })();
    }

    addUserToServer(userId: string, serverId: string): void {
        this.db
            .prepare(`
                INSERT INTO user_servers (user_id, server_id, joined_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, server_id) DO NOTHING
            `)
            .run(userId, serverId);
    }

    getUserServers(userId: string): string[] {
        const rows = this.db
            .prepare('SELECT server_id FROM user_servers WHERE user_id = ?')
            .all(userId) as Array<{ server_id: string }>;
        return rows.map(r => r.server_id);
    }

    getUsersInTimezone(timezone: string): string[] {
        const rows = this.db
            .prepare('SELECT user_id FROM users WHERE timezone_identifier = ?')
            .all(timezone) as Array<{ user_id: string }>;
        return rows.map(r => r.user_id);
    }

    getAllActiveTimezones(): string[] {
        const rows = this.db
            .prepare('SELECT DISTINCT timezone_identifier FROM users')
            .all() as Array<{ timezone_identifier: string }>;
        return rows.map(r => r.timezone_identifier);
    }

    getStats(): BotStats {
        const totalUsers = (
            this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
        ).count;

        const totalConnections = (
            this.db.prepare('SELECT COUNT(*) as count FROM user_servers').get() as { count: number }
        ).count;

        const popularTimezones = this.db
            .prepare(`
                SELECT timezone_identifier, COUNT(*) as count
                FROM users
                GROUP BY timezone_identifier
                ORDER BY count DESC
                LIMIT 10
            `)
            .all() as Array<{ timezone_identifier: string; count: number }>;

        return { totalUsers, totalConnections, popularTimezones };
    }
}
