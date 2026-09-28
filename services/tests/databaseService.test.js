process.env.DATABASE_PATH = ':memory:';

const database = require('../../config/database');
const databaseService = require('../databaseService');

const deletionDateOf = async (userId) => (await database.get('SELECT deletion_date FROM users WHERE user_id = ?', [userId]))?.deletion_date;

describe('DatabaseService (in-memory SQLite)', () => {
    beforeAll(async () => {
        jest.spyOn(console, 'log').mockImplementation();
        await database.connect();
    });

    afterAll(async () => {
        await database.close();
    });

    beforeEach(async () => {
        jest.spyOn(console, 'log').mockImplementation();
        await database.run('DELETE FROM user_servers');
        await database.run('DELETE FROM users');
    });

    test('changing timezone keeps the user\'s server links', async () => {
        await databaseService.setUserTimezone('u1', 'Europe/London');
        await databaseService.addUserToServer('u1', 's1');
        await databaseService.addUserToServer('u1', 's2');

        await databaseService.setUserTimezone('u1', 'America/New_York');

        expect(await databaseService.getUserServers('u1')).toEqual(expect.arrayContaining(['s1', 's2']));
        expect((await databaseService.getUserTimezone('u1')).timezone_identifier).toBe('America/New_York');
    });

    describe('removeServer', () => {
        test('deletes the server\'s links but keeps users who are still in other servers', async () => {
            await databaseService.setUserTimezone('u1', 'Europe/London');
            await databaseService.addUserToServer('u1', 's1');
            await databaseService.addUserToServer('u1', 's2');

            const result = await databaseService.removeServer('s1');

            expect(result).toEqual({ linksRemoved: 1, usersScheduled: 0 });
            expect(await databaseService.getUserServers('u1')).toEqual(['s2']);
            expect(await deletionDateOf('u1')).toBeNull();
        });

        test('schedules deletion ~6 months out when it was the user\'s last server', async () => {
            await databaseService.setUserTimezone('u1', 'Europe/London');
            await databaseService.addUserToServer('u1', 's1');

            const result = await databaseService.removeServer('s1');

            expect(result).toEqual({ linksRemoved: 1, usersScheduled: 1 });
            const days = (new Date(`${await deletionDateOf('u1')}Z`) - Date.now()) / 86400000;
            expect(days).toBeGreaterThan(180);
            expect(days).toBeLessThan(185);
        });

        test('does not touch users in other servers', async () => {
            await databaseService.setUserTimezone('u2', 'Europe/London');
            await databaseService.addUserToServer('u2', 's9');

            await databaseService.removeServer('s1');

            expect(await deletionDateOf('u2')).toBeNull();
        });
    });

    test('seeing the user in a server again cancels the pending deletion', async () => {
        await databaseService.setUserTimezone('u1', 'Europe/London');
        await databaseService.addUserToServer('u1', 's1');
        await databaseService.removeServer('s1');
        expect(await deletionDateOf('u1')).not.toBeNull();

        await databaseService.addUserToServer('u1', 's2');

        expect(await deletionDateOf('u1')).toBeNull();
    });

    describe('purgeExpiredUsers', () => {
        test('deletes only users whose deletion date has passed', async () => {
            for (const id of ['expired', 'pending', 'active']) {
                await databaseService.setUserTimezone(id, 'Europe/London');
                await databaseService.addUserToServer(id, 's1');
            }
            await database.run("UPDATE users SET deletion_date = datetime('now', '-1 day') WHERE user_id = 'expired'");
            await database.run("UPDATE users SET deletion_date = datetime('now', '+1 day') WHERE user_id = 'pending'");

            expect(await databaseService.purgeExpiredUsers()).toBe(1);

            expect(await databaseService.getUserTimezone('expired')).toBeNull();
            expect(await databaseService.getUserServers('expired')).toEqual([]);
            expect(await databaseService.getUserTimezone('pending')).not.toBeNull();
            expect(await databaseService.getUserTimezone('active')).not.toBeNull();
        });
    });

    test('concurrent transactions do not collide', async () => {
        await databaseService.setUserTimezone('u1', 'Europe/London');
        await Promise.all(['s1', 's2', 's3', 's4'].map(s => databaseService.addUserToServer('u1', s)));
        expect(await databaseService.getUserServers('u1')).toHaveLength(4);
    });
});
