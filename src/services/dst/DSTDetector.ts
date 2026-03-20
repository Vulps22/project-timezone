import { DateTime } from 'luxon';
import { offsetMinutesToString } from '../TimezoneService';
import type { IDSTDetector } from '../../types';

/** The local hour at which we check for a DST transition. */
const CHECK_HOUR = 5;

/**
 * Detects DST changes by comparing the UTC offset at CHECK_HOUR today
 * against the same time yesterday. Pure logic — no I/O, no side effects.
 */
export class DSTDetector implements IDSTDetector {
    /**
     * Returns the new UTC offset string if a DST transition occurred in the
     * given timezone (detected at CHECK_HOUR local time), or null otherwise.
     */
    getDSTChange(timezone: string): string | null {
        const now = DateTime.now().setZone(timezone);

        if (now.hour !== CHECK_HOUR) return null;

        const yesterday = now.minus({ days: 1 });

        if (now.offset === yesterday.offset) return null;

        return offsetMinutesToString(now.offset);
    }
}
