const nicknameService = require('../nicknameService');

function makeMember({ nickname = null, globalName = null, username = 'handle', isOwner = false, manageable = true } = {}) {
    return {
        id: 'user1',
        nickname,
        manageable,
        user: { id: 'user1', username, globalName },
        guild: { id: 'guild1', name: 'Test Guild', ownerId: isOwner ? 'user1' : 'owner' },
        setNickname: jest.fn(async function (name) { this.nickname = name; })
    };
}

// Asia/Kolkata has no DST, so the offset is stable whenever the tests run
const TZ = 'Asia/Kolkata';

describe('NicknameService', () => {
    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation();
    });

    describe('buildNickname', () => {
        test('keeps the global display name when there is no server nickname', () => {
            const member = makeMember({ globalName: 'Vulps', username: 'vulps22' });
            expect(nicknameService.buildNickname(member, TZ)).toBe('Vulps (UTC+5.5)');
        });

        test('prefers the server nickname over the global display name', () => {
            const member = makeMember({ nickname: 'Server Name', globalName: 'Vulps' });
            expect(nicknameService.buildNickname(member, TZ)).toBe('Server Name (UTC+5.5)');
        });

        test('falls back to username when nothing else is set', () => {
            const member = makeMember({ username: 'vulps22' });
            expect(nicknameService.buildNickname(member, TZ)).toBe('vulps22 (UTC+5.5)');
        });

        test('replaces an existing timezone suffix instead of stacking it', () => {
            const member = makeMember({ nickname: 'Vulps (UTC+1)' });
            expect(nicknameService.buildNickname(member, TZ)).toBe('Vulps (UTC+5.5)');
        });
    });

    describe('buildClearedNickname', () => {
        test('resets to null when the clean name matches the global display name', () => {
            const member = makeMember({ nickname: 'Vulps (UTC+1)', globalName: 'Vulps' });
            expect(nicknameService.buildClearedNickname(member)).toBeNull();
        });

        test('keeps a custom server nickname', () => {
            const member = makeMember({ nickname: 'Custom (UTC+1)', globalName: 'Vulps' });
            expect(nicknameService.buildClearedNickname(member)).toBe('Custom');
        });
    });

    describe('applyTimezone', () => {
        test('updates the nickname', async () => {
            const member = makeMember({ globalName: 'Vulps' });
            const result = await nicknameService.applyTimezone(member, TZ);
            expect(result.status).toBe('updated');
            expect(member.setNickname).toHaveBeenCalledWith('Vulps (UTC+5.5)');
        });

        test('does nothing when already correct', async () => {
            const member = makeMember({ nickname: 'Vulps (UTC+5.5)' });
            const result = await nicknameService.applyTimezone(member, TZ);
            expect(result.status).toBe('no_change');
            expect(member.setNickname).not.toHaveBeenCalled();
        });

        test('skips server owners', async () => {
            const member = makeMember({ isOwner: true });
            expect((await nicknameService.applyTimezone(member, TZ)).status).toBe('skipped_owner');
            expect(member.setNickname).not.toHaveBeenCalled();
        });

        test('skips members the bot cannot manage', async () => {
            const member = makeMember({ manageable: false });
            expect((await nicknameService.applyTimezone(member, TZ)).status).toBe('skipped_permissions');
        });
    });
});
