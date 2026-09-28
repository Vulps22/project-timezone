/**
 * End-to-end DST switch test: real Luxon, real nickname formatting, a frozen clock
 * and fake Discord objects. Only the database and logger are mocked.
 */
const { DateTime, Settings } = require('luxon');

jest.mock('../databaseService');
jest.mock('../../utils/logger');
jest.mock('../clientProvider', () => ({ clientProvider: { getClient: jest.fn() } }));

const databaseService = require('../databaseService');
const { clientProvider } = require('../clientProvider');
const nicknameService = require('../nicknameService');
const dstService = require('../dstService');

function freezeClock(isoWithZone) {
    const millis = DateTime.fromISO(isoWithZone, { setZone: true }).toMillis();
    Settings.now = () => millis;
}

function makeGuildWithMember(guildId, member) {
    const guild = { id: guildId, name: `Guild ${guildId}`, ownerId: 'owner' };
    member.guild = guild;
    guild.members = { fetch: jest.fn(async () => member) };
    return guild;
}

function makeMember(nickname, globalName = 'Vulps') {
    return {
        id: 'user1',
        nickname,
        manageable: true,
        user: { id: 'user1', username: 'vulps22', globalName },
        setNickname: jest.fn(async function (name) { this.nickname = name; })
    };
}

function makeClient(guilds, shardId = 0) {
    return {
        guilds: { cache: new Map(guilds.map(g => [g.id, g])) },
        shard: { ids: [shardId] },
        nicknameService
    };
}

describe('DST auto-switch (simulated clock)', () => {
    const realNow = Settings.now;

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        databaseService.getDistinctTimezones.mockResolvedValue(['Europe/London']);
        databaseService.getUsersInTimezone.mockResolvedValue(['user1']);
        databaseService.getUserServers.mockResolvedValue(['g1', 'g2']);
    });

    afterEach(() => {
        Settings.now = realNow;
    });

    describe('checkTimezoneForDST', () => {
        test.each([
            ['clocks go back (BST → GMT)', '2026-10-25T05:00:00+00:00', true],
            ['clocks go forward (GMT → BST)', '2026-03-29T05:00:00+01:00', true],
            ['day after clocks go back', '2026-10-26T05:00:00+00:00', false],
            ['changeover day, but not 5am', '2026-10-25T09:00:00+00:00', false],
        ])('%s', async (_label, iso, expected) => {
            const at = DateTime.fromISO(iso, { setZone: true });
            expect(await dstService.checkTimezoneForDST('Europe/London', at)).toBe(expected);
        });
    });

    test('updates nicknames on every shard when London clocks go back', async () => {
        freezeClock('2026-10-25T05:00:00+00:00');

        // Two shards, each owning one of the user's guilds
        const memberA = makeMember('Vulps (UTC+1)');
        const memberB = makeMember(null); // no server nickname, only a global display name
        const shards = [
            makeClient([makeGuildWithMember('g1', memberA)], 0),
            makeClient([makeGuildWithMember('g2', memberB)], 1),
        ];
        const localClient = {
            ...shards[0],
            shard: {
                ids: [0],
                broadcastEval: jest.fn((fn, { context }) => Promise.all(shards.map(c => fn(c, context))))
            }
        };
        clientProvider.getClient.mockReturnValue(localClient);

        await dstService.checkDSTChanges();

        expect(memberA.nickname).toBe('Vulps (UTC+0)');
        expect(memberB.nickname).toBe('Vulps (UTC+0)');
    });

    test('works without sharding (npm run single)', async () => {
        freezeClock('2026-03-29T05:00:00+01:00');

        const member = makeMember('Vulps (UTC+0)');
        const client = { ...makeClient([makeGuildWithMember('g1', member)]), shard: null };
        clientProvider.getClient.mockReturnValue(client);

        await dstService.checkDSTChanges();

        expect(member.nickname).toBe('Vulps (UTC+1)');
    });

    test('does nothing outside the 5am window', async () => {
        freezeClock('2026-10-25T04:00:00+00:00');
        clientProvider.getClient.mockReturnValue(makeClient([]));

        await dstService.checkDSTChanges();

        expect(databaseService.getUsersInTimezone).not.toHaveBeenCalled();
    });
});
