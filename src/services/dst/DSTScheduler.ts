import type { IDSTScheduler, IDSTDetector, IDSTUpdater, IDatabaseService, ILogger, SchedulerStatus } from '../../types';

/**
 * Owns the hourly timer and orchestrates DST detection + user updates.
 * Each dependency is injected — no module-level singletons required.
 */
export class DSTScheduler implements IDSTScheduler {
    private isRunning = false;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private initialTimeoutId: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly detector: IDSTDetector,
        private readonly updater: IDSTUpdater,
        private readonly db: IDatabaseService,
        private readonly logger: ILogger,
    ) {}

    start(): void {
        if (this.isRunning) {
            console.log('⚠️ DST Scheduler already running');
            return;
        }

        const now = new Date();
        const msUntilNextHour =
            (60 - now.getMinutes()) * 60_000
            - now.getSeconds() * 1_000
            - now.getMilliseconds();

        console.log(
            `⏰ First DST check in ${Math.round(msUntilNextHour / 60_000)} minutes`,
        );

        this.initialTimeoutId = setTimeout(() => {
            this.runCheck().catch(err =>
                console.error('❌ DST check error:', err),
            );
            this.intervalId = setInterval(
                () => this.runCheck().catch(err => console.error('❌ DST check error:', err)),
                60 * 60_000,
            );
        }, msUntilNextHour);

        this.isRunning = true;
        console.log('✅ DST Scheduler started');
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.initialTimeoutId) {
            clearTimeout(this.initialTimeoutId);
            this.initialTimeoutId = null;
        }
        this.isRunning = false;
        console.log('🛑 DST Scheduler stopped');
    }

    getStatus(): SchedulerStatus {
        const next = new Date();
        next.setHours(next.getHours() + 1, 0, 0, 0);
        return {
            isRunning: this.isRunning,
            hasInterval: this.intervalId !== null,
            nextCheck: this.isRunning
                ? `Every hour (next: ${next.toTimeString().substring(0, 5)})`
                : 'Not scheduled',
        };
    }

    /** Visible for testing. */
    async runCheck(): Promise<void> {
        console.log('🔍 Checking for DST changes...');

        const timezones = this.db.getAllActiveTimezones();

        if (timezones.length === 0) {
            console.log('📭 No timezones in use');
            return;
        }

        console.log(`🌍 Checking ${timezones.length} timezone(s)`);

        const changed: string[] = [];

        for (const tz of timezones) {
            try {
                const newOffset = this.detector.getDSTChange(tz);
                if (newOffset !== null) {
                    changed.push(tz);
                    await this.logger.log(
                        `**DST Change Detected** | **Timezone:** \`${tz}\` | **New Offset:** ${newOffset}`,
                    );
                }
            } catch (err) {
                console.error(`❌ Error checking DST for ${tz}:`, err);
            }
        }

        if (changed.length === 0) {
            console.log('✅ No DST changes');
            return;
        }

        console.log(`🔄 DST changes in: ${changed.join(', ')}`);
        await this.applyDSTUpdates(changed);
    }

    private async applyDSTUpdates(timezones: string[]): Promise<void> {
        let totalUpdated = 0;

        for (const tz of timezones) {
            try {
                const users = this.db.getUsersInTimezone(tz);
                let tzUpdated = 0;

                for (const userId of users) {
                    try {
                        const servers = this.db.getUserServers(userId);
                        const count = await this.updater.updateUserNicknames(userId, tz, servers);
                        tzUpdated += count;
                    } catch (err) {
                        console.error(`❌ Error updating user ${userId}:`, err instanceof Error ? err.message : err);
                    }
                }

                console.log(`✅ Updated ${tzUpdated} user(s) in ${tz}`);
                totalUpdated += tzUpdated;

                const newOffset = this.detector.getDSTChange(tz);
                await this.logger.logDSTChange(tz, tzUpdated, newOffset ?? 'unknown');
            } catch (err) {
                console.error(`❌ Error processing ${tz}:`, err);
            }
        }

        if (totalUpdated > 0) {
            await this.logger.log(
                `**DST Update Complete** | ${totalUpdated} user(s) updated across ${timezones.length} timezone(s)`,
            );
        }
    }
}
