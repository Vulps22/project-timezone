import { DateTime } from 'luxon';
import { TimezoneService, offsetMinutesToString, buildNickname } from '../services/TimezoneService';

describe('TimezoneService', () => {
    let svc: TimezoneService;

    beforeEach(() => {
        svc = new TimezoneService();
    });

    // ─── isValidTimezone ────────────────────────────────────────────────────

    describe('isValidTimezone', () => {
        test.each([
            'America/New_York',
            'Europe/London',
            'Asia/Tokyo',
            'UTC',
            'Asia/Kolkata',
            'Asia/Kathmandu',
        ])('accepts valid timezone %s', tz => {
            expect(svc.isValidTimezone(tz)).toBe(true);
        });

        test.each([
            '',
            'Invalid/Zone',
            'NotATimezone',
            'America/Fake',
        ])('rejects invalid timezone %s', tz => {
            expect(svc.isValidTimezone(tz)).toBe(false);
        });
    });

    // ─── getCurrentOffset ───────────────────────────────────────────────────

    describe('getCurrentOffset', () => {
        test('returns UTC+0 for UTC', () => {
            expect(svc.getCurrentOffset('UTC')).toBe('UTC+0');
        });

        test('returns negative offset for US zones in winter', () => {
            const spy = jest.spyOn(DateTime, 'now').mockReturnValue(
                DateTime.fromISO('2024-01-15T12:00:00', { zone: 'America/New_York' }) as ReturnType<typeof DateTime.now>,
            );
            expect(svc.getCurrentOffset('America/New_York')).toBe('UTC-5');
            spy.mockRestore();
        });

        test('returns positive offset for Asia/Kolkata (30-min)', () => {
            expect(svc.getCurrentOffset('Asia/Kolkata')).toBe('UTC+5.5');
        });

        test('returns fractional offset for Asia/Kathmandu (45-min)', () => {
            expect(svc.getCurrentOffset('Asia/Kathmandu')).toBe('UTC+5.75');
        });

        test('throws for invalid timezone', () => {
            expect(() => svc.getCurrentOffset('Fake/Zone')).toThrow('Invalid timezone');
        });
    });

    // ─── removeTimezoneFromNickname / hasTimezoneInfo ───────────────────────

    describe('removeTimezoneFromNickname', () => {
        test.each([
            ['Bob (UTC+5)', 'Bob'],
            ['Alice (UTC-3)', 'Alice'],
            ['João (UTC+5.5)', 'João'],
            ['NoTimezone', 'NoTimezone'],
            ['', ''],
        ])('strips timezone from "%s"', (input, expected) => {
            expect(svc.removeTimezoneFromNickname(input)).toBe(expected);
        });

        test('does not strip timezone mid-nickname', () => {
            expect(svc.removeTimezoneFromNickname('(UTC+5) Bob')).toBe('(UTC+5) Bob');
        });
    });

    describe('hasTimezoneInfo', () => {
        test('returns true when timezone suffix present', () => {
            expect(svc.hasTimezoneInfo('Bob (UTC+5)')).toBe(true);
        });

        test('returns false when no suffix', () => {
            expect(svc.hasTimezoneInfo('Bob')).toBe(false);
        });
    });

    // ─── formatNicknameWithTimezone ─────────────────────────────────────────

    describe('formatNicknameWithTimezone', () => {
        test('adds timezone suffix to plain nickname', () => {
            const spy = jest.spyOn(DateTime, 'now').mockReturnValue(
                DateTime.fromISO('2024-01-15T12:00:00', { zone: 'America/New_York' }) as ReturnType<typeof DateTime.now>,
            );
            expect(svc.formatNicknameWithTimezone('Bob', 'America/New_York', 'bob123')).toBe('Bob (UTC-5)');
            spy.mockRestore();
        });

        test('replaces existing timezone suffix', () => {
            const spy = jest.spyOn(DateTime, 'now').mockReturnValue(
                DateTime.fromISO('2024-03-10T12:00:00', { zone: 'America/New_York' }) as ReturnType<typeof DateTime.now>,
            );
            expect(svc.formatNicknameWithTimezone('Bob (UTC-5)', 'America/New_York', 'bob123')).toBe('Bob (UTC-4)');
            spy.mockRestore();
        });

        test('falls back to username when nickname is null', () => {
            const spy = jest.spyOn(DateTime, 'now').mockReturnValue(
                DateTime.fromISO('2024-01-15T12:00:00', { zone: 'UTC' }) as ReturnType<typeof DateTime.now>,
            );
            expect(svc.formatNicknameWithTimezone(null, 'UTC', 'cooluser')).toBe('cooluser (UTC+0)');
            spy.mockRestore();
        });

        test('returns null for invalid timezone', () => {
            expect(svc.formatNicknameWithTimezone('Bob', 'Fake/Zone', 'bob')).toBeNull();
        });
    });

    // ─── searchTimezones ────────────────────────────────────────────────────

    describe('searchTimezones', () => {
        test('returns ≤25 results', () => {
            expect(svc.searchTimezones('a').length).toBeLessThanOrEqual(25);
        });

        test('returns first 25 for short query', () => {
            expect(svc.searchTimezones('a').length).toBe(25);
        });

        test('filters case-insensitively', () => {
            const upper = svc.searchTimezones('NEW_YORK');
            const lower = svc.searchTimezones('new_york');
            expect(upper).toEqual(lower);
            expect(upper.some(tz => tz.value === 'America/New_York')).toBe(true);
        });

        test('returns empty array for no matches', () => {
            expect(svc.searchTimezones('zzznomatch')).toHaveLength(0);
        });
    });
});

// ─── Pure helper functions ───────────────────────────────────────────────────

describe('offsetMinutesToString', () => {
    test.each([
        [0, 'UTC+0'],
        [60, 'UTC+1'],
        [-300, 'UTC-5'],
        [330, 'UTC+5.5'],
        [345, 'UTC+5.75'],
        [-210, 'UTC-3.5'],
    ])('converts %d minutes to %s', (minutes, expected) => {
        expect(offsetMinutesToString(minutes)).toBe(expected);
    });
});

describe('buildNickname', () => {
    test('builds nickname within 32 chars', () => {
        expect(buildNickname('Bob', 'UTC+5')).toBe('Bob (UTC+5)');
    });

    test('truncates base name to fit 32-char limit', () => {
        const longName = 'A'.repeat(30);
        const result = buildNickname(longName, 'UTC+5');
        expect(result.length).toBeLessThanOrEqual(32);
        expect(result.endsWith('(UTC+5)')).toBe(true);
    });
});
