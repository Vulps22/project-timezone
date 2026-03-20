import { DateTime } from 'luxon';
import type { ITimezoneService, TimezoneOption, TimeInfo } from '../types';

const TIMEZONE_SUFFIX_REGEX = /\s*\(UTC[+-][\d.]+\)$/i;
const MAX_NICKNAME_LENGTH = 32;

export class TimezoneService implements ITimezoneService {
    private readonly cachedTimezones: TimezoneOption[];

    constructor() {
        this.cachedTimezones = this.buildTimezoneCache();
    }

    private buildTimezoneCache(): TimezoneOption[] {
        try {
            // Intl.supportedValuesOf available in Node 18+ / TS lib ES2022+
            const intlAny = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
            if (typeof intlAny.supportedValuesOf === 'function') {
                return (intlAny.supportedValuesOf('timeZone'))
                    .filter(tz => this.isValidTimezone(tz))
                    .map(tz => ({ name: tz, value: tz }))
                    .sort((a, b) => a.name.localeCompare(b.name));
            }
        } catch {
            // fall through to common list
        }
        return this.getCommonTimezones();
    }

    isValidTimezone(timezone: string): boolean {
        if (!timezone || typeof timezone !== 'string') return false;
        try {
            const dt = DateTime.now().setZone(timezone);
            return dt.isValid && dt.zoneName !== null;
        } catch {
            return false;
        }
    }

    getCurrentOffset(timezone: string): string {
        if (!this.isValidTimezone(timezone)) {
            throw new Error(`Invalid timezone: ${timezone}`);
        }
        const dt = DateTime.now().setZone(timezone);
        return offsetMinutesToString(dt.offset);
    }

    getCurrentTime(timezone: string): TimeInfo | null {
        if (!this.isValidTimezone(timezone)) return null;
        try {
            const dt = DateTime.now().setZone(timezone);
            return {
                timezone,
                time: dt.toFormat('HH:mm:ss'),
                date: dt.toFormat('yyyy-MM-dd'),
                fullDateTime: dt.toFormat('yyyy-MM-dd HH:mm:ss'),
                offset: this.getCurrentOffset(timezone),
                dayName: dt.toFormat('cccc'),
                monthName: dt.toFormat('MMMM'),
                formatted: dt.toFormat("cccc, MMMM dd, yyyy 'at' HH:mm:ss"),
            };
        } catch {
            return null;
        }
    }

    formatNicknameWithTimezone(
        currentNickname: string | null,
        timezone: string,
        username: string,
    ): string | null {
        try {
            const offset = this.getCurrentOffset(timezone);
            const baseName = currentNickname || username;
            const cleanName = this.removeTimezoneFromNickname(baseName);
            return buildNickname(cleanName, offset);
        } catch {
            return null;
        }
    }

    removeTimezoneFromNickname(nickname: string): string {
        if (!nickname) return '';
        return nickname.replace(TIMEZONE_SUFFIX_REGEX, '').trim();
    }

    hasTimezoneInfo(nickname: string): boolean {
        if (!nickname) return false;
        return TIMEZONE_SUFFIX_REGEX.test(nickname);
    }

    searchTimezones(query: string): TimezoneOption[] {
        const trimmed = query?.trim() ?? '';
        if (trimmed.length < 2) return this.cachedTimezones.slice(0, 25);
        const lower = trimmed.toLowerCase();
        return this.cachedTimezones
            .filter(tz => tz.name.toLowerCase().includes(lower))
            .slice(0, 25);
    }

    private getCommonTimezones(): TimezoneOption[] {
        const zones = [
            'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
            'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
            'America/Toronto', 'America/Vancouver', 'America/Mexico_City',
            'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
            'Europe/London', 'Europe/Paris', 'Europe/Berlin',
            'Europe/Rome', 'Europe/Moscow',
            'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
            'Asia/Jerusalem', 'Asia/Dubai',
            'Australia/Sydney', 'Australia/Melbourne',
            'Pacific/Auckland',
        ];
        return zones.map(tz => ({ name: tz, value: tz }));
    }
}

/** Converts a Luxon offset-in-minutes to a "UTC±X" display string. */
export function offsetMinutesToString(offsetMinutes: number): string {
    if (offsetMinutes === 0) return 'UTC+0';
    const sign = offsetMinutes > 0 ? '+' : '-';
    const totalMinutes = Math.abs(offsetMinutes);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (mins === 0) return `UTC${sign}${hours}`;
    // Express sub-hour remainder as a fraction (e.g. 5:30 → 5.5, 5:45 → 5.75)
    return `UTC${sign}${hours + mins / 60}`;
}

/** Builds a nickname string respecting Discord's 32-char limit. */
export function buildNickname(cleanName: string, offsetStr: string): string {
    const candidate = `${cleanName} (${offsetStr})`;
    if (candidate.length <= MAX_NICKNAME_LENGTH) return candidate;
    const maxBase = MAX_NICKNAME_LENGTH - offsetStr.length - 3; // 3 = ' ()'
    return `${cleanName.substring(0, maxBase)} (${offsetStr})`;
}
