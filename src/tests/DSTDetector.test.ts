import { DateTime } from 'luxon';
import { DSTDetector } from '../services/dst/DSTDetector';

/**
 * Real DST transition dates used as test fixtures.
 * These are the actual moments clocks change — not fake offsets.
 *
 * US Spring Forward 2024:  2024-03-10 at 2am → America/New_York goes UTC-5 → UTC-4
 * US Fall Back 2024:       2024-11-03 at 2am → America/New_York goes UTC-4 → UTC-5
 * UK Spring Forward 2024:  2024-03-31 at 1am → Europe/London goes UTC+0 → UTC+1
 * AU Fall Back 2024:       2024-04-07 at 3am → Australia/Sydney goes UTC+11 → UTC+10
 */

describe('DSTDetector', () => {
    let detector: DSTDetector;

    beforeEach(() => {
        detector = new DSTDetector();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function mockNowAt(isoDateTime: string, zone: string): void {
        jest.spyOn(DateTime, 'now').mockReturnValue(
            DateTime.fromISO(isoDateTime, { zone }) as ReturnType<typeof DateTime.now>,
        );
    }

    // ─── Returns null when not 5am ──────────────────────────────────────────

    describe('outside the 5am check window', () => {
        test.each([0, 1, 4, 6, 12, 23])(
            'returns null at hour %d (not 5am)',
            (hour) => {
                const hourStr = String(hour).padStart(2, '0');
                mockNowAt(`2024-03-10T${hourStr}:00:00`, 'America/New_York');
                expect(detector.getDSTChange('America/New_York')).toBeNull();
            },
        );
    });

    // ─── Returns null on normal (non-DST) days ──────────────────────────────

    describe('normal days (no DST)', () => {
        test('returns null at 5am on a regular winter day', () => {
            mockNowAt('2024-01-15T05:00:00', 'America/New_York');
            expect(detector.getDSTChange('America/New_York')).toBeNull();
        });

        test('returns null at 5am on a regular summer day', () => {
            mockNowAt('2024-07-15T05:00:00', 'America/New_York');
            expect(detector.getDSTChange('America/New_York')).toBeNull();
        });

        test('returns null for non-DST timezone (UTC)', () => {
            mockNowAt('2024-03-10T05:00:00', 'UTC');
            expect(detector.getDSTChange('UTC')).toBeNull();
        });

        test('returns null for non-DST timezone (Asia/Tokyo)', () => {
            mockNowAt('2024-03-10T05:00:00', 'Asia/Tokyo');
            expect(detector.getDSTChange('Asia/Tokyo')).toBeNull();
        });

        test('returns null the day AFTER a DST transition', () => {
            // 2024-03-11 is the day after US spring forward — no change
            mockNowAt('2024-03-11T05:00:00', 'America/New_York');
            expect(detector.getDSTChange('America/New_York')).toBeNull();
        });
    });

    // ─── Detects real DST transitions ───────────────────────────────────────

    describe('DST transition days', () => {
        test('detects US spring forward (America/New_York, 2024-03-10)', () => {
            mockNowAt('2024-03-10T05:00:00', 'America/New_York');
            expect(detector.getDSTChange('America/New_York')).toBe('UTC-4');
        });

        test('detects US fall back (America/New_York, 2024-11-03)', () => {
            mockNowAt('2024-11-03T05:00:00', 'America/New_York');
            expect(detector.getDSTChange('America/New_York')).toBe('UTC-5');
        });

        test('detects UK spring forward (Europe/London, 2024-03-31)', () => {
            mockNowAt('2024-03-31T05:00:00', 'Europe/London');
            expect(detector.getDSTChange('Europe/London')).toBe('UTC+1');
        });

        test('detects Australia/Sydney fall back (2024-04-07)', () => {
            mockNowAt('2024-04-07T05:00:00', 'Australia/Sydney');
            expect(detector.getDSTChange('Australia/Sydney')).toBe('UTC+10');
        });

        test('detects US spring forward for Chicago (same day as New York)', () => {
            mockNowAt('2024-03-10T05:00:00', 'America/Chicago');
            expect(detector.getDSTChange('America/Chicago')).toBe('UTC-5');
        });
    });

    // ─── Return value format ────────────────────────────────────────────────

    describe('return value format', () => {
        test('returns a UTC offset string, not a boolean', () => {
            mockNowAt('2024-03-10T05:00:00', 'America/New_York');
            const result = detector.getDSTChange('America/New_York');
            expect(result).toMatch(/^UTC[+-][\d.]+$/);
        });

        test('returned offset reflects the NEW (post-DST) offset', () => {
            // Before spring forward: UTC-5.  After: UTC-4.
            mockNowAt('2024-03-10T05:00:00', 'America/New_York');
            expect(detector.getDSTChange('America/New_York')).toBe('UTC-4');
        });
    });
});
