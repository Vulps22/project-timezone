import { DSTScheduler } from '../services/dst/DSTScheduler';
import type { IDSTDetector, IDSTUpdater, IDatabaseService, ILogger } from '../types';

function makeDetector(returnValue: string | null = null): jest.Mocked<IDSTDetector> {
    return { getDSTChange: jest.fn().mockReturnValue(returnValue) };
}

function makeUpdater(count = 0): jest.Mocked<IDSTUpdater> {
    return { updateUserNicknames: jest.fn().mockResolvedValue(count) };
}

function makeDb(timezones: string[] = [], users: string[] = [], servers: string[] = []): jest.Mocked<IDatabaseService> {
    return {
        getAllActiveTimezones: jest.fn().mockReturnValue(timezones),
        getUsersInTimezone: jest.fn().mockReturnValue(users),
        getUserServers: jest.fn().mockReturnValue(servers),
        getUserTimezone: jest.fn(),
        setUserTimezone: jest.fn(),
        deleteUser: jest.fn(),
        addUserToServer: jest.fn(),
        getStats: jest.fn(),
    };
}

function makeLogger(): jest.Mocked<ILogger> {
    return {
        log: jest.fn().mockResolvedValue(null),
        error: jest.fn().mockResolvedValue(null),
        logCommand: jest.fn().mockResolvedValue(undefined),
        logTimezoneSet: jest.fn().mockResolvedValue(undefined),
        logNicknameUpdate: jest.fn().mockResolvedValue(undefined),
        logDSTChange: jest.fn().mockResolvedValue(undefined),
        logPermissionError: jest.fn().mockResolvedValue(undefined),
    };
}

describe('DSTScheduler', () => {
    let scheduler: DSTScheduler;

    afterEach(() => {
        scheduler?.stop();
        jest.restoreAllMocks();
    });

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    describe('lifecycle', () => {
        test('starts and reports running', () => {
            scheduler = new DSTScheduler(makeDetector(), makeUpdater(), makeDb(), makeLogger());
            expect(scheduler.getStatus().isRunning).toBe(false);
            scheduler.start();
            expect(scheduler.getStatus().isRunning).toBe(true);
        });

        test('stops cleanly', () => {
            scheduler = new DSTScheduler(makeDetector(), makeUpdater(), makeDb(), makeLogger());
            scheduler.start();
            scheduler.stop();
            expect(scheduler.getStatus().isRunning).toBe(false);
        });

        test('does not start twice', () => {
            const logSpy = jest.spyOn(console, 'log').mockImplementation();
            scheduler = new DSTScheduler(makeDetector(), makeUpdater(), makeDb(), makeLogger());
            scheduler.start();
            scheduler.start();
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('already running'));
        });
    });

    // ─── runCheck with no timezones ─────────────────────────────────────────

    describe('runCheck', () => {
        test('does nothing when no timezones in DB', async () => {
            const detector = makeDetector();
            scheduler = new DSTScheduler(detector, makeUpdater(), makeDb([]), makeLogger());
            await scheduler.runCheck();
            expect(detector.getDSTChange).not.toHaveBeenCalled();
        });

        test('checks every active timezone', async () => {
            const detector = makeDetector(null);
            const db = makeDb(['America/New_York', 'Europe/London', 'Asia/Tokyo']);
            scheduler = new DSTScheduler(detector, makeUpdater(), db, makeLogger());
            await scheduler.runCheck();
            expect(detector.getDSTChange).toHaveBeenCalledTimes(3);
            expect(detector.getDSTChange).toHaveBeenCalledWith('America/New_York');
            expect(detector.getDSTChange).toHaveBeenCalledWith('Europe/London');
            expect(detector.getDSTChange).toHaveBeenCalledWith('Asia/Tokyo');
        });

        test('does not call updater when no DST changes detected', async () => {
            const updater = makeUpdater();
            scheduler = new DSTScheduler(
                makeDetector(null), // no DST change
                updater,
                makeDb(['America/New_York']),
                makeLogger(),
            );
            await scheduler.runCheck();
            expect(updater.updateUserNicknames).not.toHaveBeenCalled();
        });

        test('calls updater for each user in a changed timezone', async () => {
            const updater = makeUpdater(1);
            const db = makeDb(
                ['America/New_York'],       // timezones
                ['user1', 'user2'],         // users in that timezone
                ['server1'],               // servers per user
            );
            scheduler = new DSTScheduler(makeDetector('UTC-4'), updater, db, makeLogger());
            await scheduler.runCheck();
            expect(updater.updateUserNicknames).toHaveBeenCalledTimes(2);
            expect(updater.updateUserNicknames).toHaveBeenCalledWith('user1', 'America/New_York', ['server1']);
            expect(updater.updateUserNicknames).toHaveBeenCalledWith('user2', 'America/New_York', ['server1']);
        });

        test('checks ALL timezones (not just top 10)', async () => {
            const detector = makeDetector(null);
            const zones = Array.from({ length: 15 }, (_, i) => `Zone/${i}`);
            scheduler = new DSTScheduler(detector, makeUpdater(), makeDb(zones), makeLogger());
            await scheduler.runCheck();
            expect(detector.getDSTChange).toHaveBeenCalledTimes(15);
        });

        test('continues checking remaining timezones if one throws', async () => {
            const detector: jest.Mocked<IDSTDetector> = {
                getDSTChange: jest.fn()
                    .mockImplementationOnce(() => { throw new Error('bad zone'); })
                    .mockReturnValue(null),
            };
            const db = makeDb(['Bad/Zone', 'America/New_York']);
            const errorSpy = jest.spyOn(console, 'error').mockImplementation();

            scheduler = new DSTScheduler(detector, makeUpdater(), db, makeLogger());
            await expect(scheduler.runCheck()).resolves.not.toThrow();
            expect(detector.getDSTChange).toHaveBeenCalledTimes(2);
            expect(errorSpy).toHaveBeenCalled();
        });

        test('logs DST change summary', async () => {
            const log = makeLogger();
            scheduler = new DSTScheduler(
                makeDetector('UTC-4'),
                makeUpdater(2),
                makeDb(['America/New_York'], ['user1'], ['s1']),
                log,
            );
            await scheduler.runCheck();
            expect(log.log).toHaveBeenCalledWith(expect.stringContaining('DST Change Detected'));
            expect(log.logDSTChange).toHaveBeenCalledWith('America/New_York', 2, 'UTC-4');
        });
    });

    // ─── Timer integration ──────────────────────────────────────────────────

    describe('timer integration', () => {
        test('fires runCheck after initial timeout and then every hour', async () => {
            jest.useFakeTimers();
            const runCheckSpy = jest.spyOn(
                DSTScheduler.prototype,
                'runCheck',
            ).mockResolvedValue(undefined);

            scheduler = new DSTScheduler(makeDetector(), makeUpdater(), makeDb(), makeLogger());
            scheduler.start();

            // Trigger the initial timeout (up to 1 hour away)
            jest.advanceTimersByTime(61 * 60_000);
            await Promise.resolve();

            expect(runCheckSpy).toHaveBeenCalledTimes(1);

            // Trigger one hourly interval
            jest.advanceTimersByTime(60 * 60_000);
            await Promise.resolve();

            expect(runCheckSpy).toHaveBeenCalledTimes(2);

            scheduler.stop();
            jest.useRealTimers();
        });
    });
});
