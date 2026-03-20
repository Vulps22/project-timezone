import { DSTUpdater } from '../services/dst/DSTUpdater';
import type { IClientProvider, ILogger } from '../types';

function makeClientProvider(broadcastResult: unknown[]): IClientProvider {
    return {
        setClient: jest.fn(),
        hasClient: () => true,
        getClient: () =>
            ({
                shard: { broadcastEval: jest.fn().mockResolvedValue(broadcastResult) },
            }) as unknown as import('discord.js').Client,
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

describe('DSTUpdater', () => {
    describe('updateUserNicknames', () => {
        test('returns 0 for empty server list without calling broadcastEval', async () => {
            const provider = makeClientProvider([]);
            const updater = new DSTUpdater(provider, makeLogger());

            const result = await updater.updateUserNicknames('user1', 'America/New_York', []);

            expect(result).toBe(0);
            expect(provider.getClient().shard!.broadcastEval).not.toHaveBeenCalled();
        });

        test('sums updated counts across all shards', async () => {
            const shardResults = [
                { shardId: 0, updatedCount: 2, results: [
                    { serverId: 's1', serverName: 'Server1', status: 'updated', oldNickname: 'Bob', newNickname: 'Bob (UTC-4)' },
                    { serverId: 's2', serverName: 'Server2', status: 'updated', oldNickname: 'Bob (UTC-5)', newNickname: 'Bob (UTC-4)' },
                ]},
                { shardId: 1, updatedCount: 0, results: [] },
            ];

            const provider = makeClientProvider(shardResults);
            const logger = makeLogger();
            const updater = new DSTUpdater(provider, logger);

            const result = await updater.updateUserNicknames('user1', 'America/New_York', ['s1', 's2']);

            expect(result).toBe(2);
        });

        test('calls logNicknameUpdate for each updated result', async () => {
            const shardResults = [
                {
                    shardId: 0,
                    updatedCount: 1,
                    results: [
                        { serverId: 's1', serverName: 'TestServer', status: 'updated', oldNickname: 'Bob', newNickname: 'Bob (UTC-4)' },
                    ],
                },
            ];

            const provider = makeClientProvider(shardResults);
            const logger = makeLogger();
            const updater = new DSTUpdater(provider, logger);

            await updater.updateUserNicknames('user1', 'America/New_York', ['s1']);

            expect(logger.logNicknameUpdate).toHaveBeenCalledWith('user1', 's1', 'Bob', 'Bob (UTC-4)');
        });

        test('does not call logNicknameUpdate for skipped or no_change results', async () => {
            const shardResults = [
                {
                    shardId: 0,
                    updatedCount: 0,
                    results: [
                        { serverId: 's1', serverName: 'TestServer', status: 'skipped_owner' },
                        { serverId: 's2', serverName: 'TestServer2', status: 'no_change' },
                    ],
                },
            ];

            const provider = makeClientProvider(shardResults);
            const logger = makeLogger();
            const updater = new DSTUpdater(provider, logger);

            await updater.updateUserNicknames('user1', 'America/New_York', ['s1', 's2']);

            expect(logger.logNicknameUpdate).not.toHaveBeenCalled();
        });

        test('handles broadcastEval rejection gracefully', async () => {
            const provider: IClientProvider = {
                setClient: jest.fn(),
                hasClient: () => true,
                getClient: () =>
                    ({
                        shard: {
                            broadcastEval: jest.fn().mockRejectedValue(new Error('Network error')),
                        },
                    }) as unknown as import('discord.js').Client,
            };

            const updater = new DSTUpdater(provider, makeLogger());

            await expect(updater.updateUserNicknames('user1', 'America/New_York', ['s1'])).rejects.toThrow('Network error');
        });
    });
});
