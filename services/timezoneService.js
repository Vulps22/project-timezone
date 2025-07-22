const { DateTime } = require('luxon');

class TimezoneService {
    /**
     * Validate a timezone identifier
     * @param {string} timezone - Timezone identifier to validate
     * @returns {boolean} True if valid, false otherwise
     */
    isValidTimezone(timezone) {
        try {
            // Try to create a DateTime in the specified timezone
            DateTime.now().setZone(timezone);
            // Check if it's a valid zone
            return DateTime.now().setZone(timezone).isValid;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get current UTC offset for a timezone
     * @param {string} timezone - Timezone identifier
     * @returns {string|null} UTC offset string (e.g., "UTC+5", "UTC-3") or null if invalid
     */
    getCurrentOffset(timezone) {
        try {
            if (!this.isValidTimezone(timezone)) {
                return null;
            }

            const dt = DateTime.now().setZone(timezone);
            const offset = dt.offset; // Offset in minutes
            
            if (offset === 0) {
                return "UTC+0";
            }
            
            const hours = Math.abs(offset / 60);
            const sign = offset > 0 ? '+' : '-';
            
            // Format as whole hours or with .5 for 30-minute offsets
            if (hours % 1 === 0) {
                return `UTC${sign}${Math.floor(hours)}`;
            } else {
                return `UTC${sign}${hours}`;
            }
        } catch (error) {
            console.error('Error getting current offset:', error);
            return null;
        }
    }

    /**
     * Get current time for a specific timezone
     * @param {string} timezone - Timezone identifier
     * @returns {Object|null} Time information or null if invalid
     */
    getCurrentTime(timezone) {
        try {
            if (!this.isValidTimezone(timezone)) {
                return null;
            }

            const dt = DateTime.now().setZone(timezone);
            
            return {
                timezone: timezone,
                time: dt.toFormat('HH:mm:ss'),
                date: dt.toFormat('yyyy-MM-dd'),
                fullDateTime: dt.toFormat('yyyy-MM-dd HH:mm:ss'),
                offset: this.getCurrentOffset(timezone),
                dayName: dt.toFormat('cccc'),
                monthName: dt.toFormat('MMMM'),
                formatted: dt.toFormat('cccc, MMMM dd, yyyy \'at\' HH:mm:ss')
            };
        } catch (error) {
            console.error('Error getting current time:', error);
            return null;
        }
    }

    /**
     * Update nickname with timezone offset
     * @param {string} currentNickname - Current nickname or username
     * @param {string} timezone - Timezone identifier
     * @param {string} username - Discord username (fallback if no nickname)
     * @returns {string|null} New nickname with timezone or null if error
     */
    formatNicknameWithTimezone(currentNickname, timezone, username) {
        try {
            const offset = this.getCurrentOffset(timezone);
            if (!offset) {
                return null;
            }

            // Use current nickname or fall back to username
            const baseName = currentNickname || username;
            
            // Remove existing timezone info if present
            const cleanName = this.removeTimezoneFromNickname(baseName);
            
            // Add new timezone info
            const newNickname = `${cleanName} (${offset})`;
            
            // Discord nickname limit is 32 characters
            if (newNickname.length > 32) {
                // Truncate the base name to fit
                const maxBaseLength = 32 - offset.length - 3; // 3 for " ()"
                const truncatedBase = cleanName.substring(0, maxBaseLength);
                return `${truncatedBase} (${offset})`;
            }
            
            return newNickname;
        } catch (error) {
            console.error('Error formatting nickname with timezone:', error);
            return null;
        }
    }

    /**
     * Remove timezone information from nickname
     * @param {string} nickname - Nickname that may contain timezone info
     * @returns {string} Clean nickname without timezone
     */
    removeTimezoneFromNickname(nickname) {
        if (!nickname) return '';
        
        // Remove patterns like " (UTC+5)", " (UTC-3)", " (UTC+0)", etc.
        return nickname.replace(/\s*\(UTC[+-][\d.]+\)$/i, '').trim();
    }

    /**
     * Check if nickname already contains timezone info
     * @param {string} nickname - Nickname to check
     * @returns {boolean} True if contains timezone info
     */
    hasTimezoneInfo(nickname) {
        if (!nickname) return false;
        return /\(UTC[+-][\d.]+\)$/i.test(nickname);
    }

    /**
     * Get list of common timezones for autocomplete
     * @returns {Array} Array of common timezone objects
     */
    getCommonTimezones() {
        return [
            { name: 'UTC', value: 'UTC' },
            { name: 'Eastern Time (US)', value: 'America/New_York' },
            { name: 'Central Time (US)', value: 'America/Chicago' },
            { name: 'Mountain Time (US)', value: 'America/Denver' },
            { name: 'Pacific Time (US)', value: 'America/Los_Angeles' },
            { name: 'Alaska Time (US)', value: 'America/Anchorage' },
            { name: 'Hawaii Time (US)', value: 'Pacific/Honolulu' },
            { name: 'London (UK)', value: 'Europe/London' },
            { name: 'Paris (France)', value: 'Europe/Paris' },
            { name: 'Berlin (Germany)', value: 'Europe/Berlin' },
            { name: 'Rome (Italy)', value: 'Europe/Rome' },
            { name: 'Moscow (Russia)', value: 'Europe/Moscow' },
            { name: 'Tokyo (Japan)', value: 'Asia/Tokyo' },
            { name: 'Shanghai (China)', value: 'Asia/Shanghai' },
            { name: 'Mumbai (India)', value: 'Asia/Kolkata' },
            { name: 'Sydney (Australia)', value: 'Australia/Sydney' },
            { name: 'Melbourne (Australia)', value: 'Australia/Melbourne' },
            { name: 'Auckland (New Zealand)', value: 'Pacific/Auckland' },
            { name: 'Toronto (Canada)', value: 'America/Toronto' },
            { name: 'Vancouver (Canada)', value: 'America/Vancouver' },
            { name: 'Mexico City (Mexico)', value: 'America/Mexico_City' },
            { name: 'São Paulo (Brazil)', value: 'America/Sao_Paulo' },
            { name: 'Buenos Aires (Argentina)', value: 'America/Argentina/Buenos_Aires' },
            { name: 'Dubai (UAE)', value: 'Asia/Dubai' }
        ];
    }

    /**
     * Search timezones by name for autocomplete
     * @param {string} query - Search query
     * @returns {Array} Array of matching timezone objects
     */
    searchTimezones(query) {
        console.log(`🔍 TimezoneService.searchTimezones called with query: "${query}"`);
        
        const common = this.getCommonTimezones();
        console.log(`📋 Common timezones loaded: ${common.length} items`);
        
        if (!query || query.length < 2) {
            console.log(`⚡ Query too short, returning first 25 common timezones`);
            const result = common.slice(0, 25);
            console.log(`📤 Returning ${result.length} timezone options`);
            return result;
        }
        
        const lowerQuery = query.toLowerCase();
        console.log(`🔎 Searching for: "${lowerQuery}"`);
        
        // Filter common timezones by name
        const matches = common.filter(tz => {
            const nameMatch = tz.name.toLowerCase().includes(lowerQuery);
            const valueMatch = tz.value.toLowerCase().includes(lowerQuery);
            return nameMatch || valueMatch;
        });
        
        console.log(`🎯 Found ${matches.length} matches for "${query}"`);
        
        if (matches.length > 0) {
            console.log(`📋 Sample matches:`, matches.slice(0, 3).map(m => m.name));
        }
        
        const result = matches.slice(0, 25); // Discord limit
        console.log(`📤 Returning ${result.length} timezone options (Discord limit: 25)`);
        
        return result;
    }
}

module.exports = new TimezoneService();
