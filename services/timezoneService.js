const { DateTime } = require('luxon');

class TimezoneService {
    constructor() {
        this.cachedTimezones = [];
        this.initializeTimezones();
    }

    /**
     * Initialize and cache all available timezones on startup
     */
    initializeTimezones() {
        try {
            console.log('🌍 Initializing timezone cache...');
            
            // Use Intl.supportedValuesOf if available (Node 18+)
            if (typeof Intl.supportedValuesOf === 'function') {
                const timezones = Intl.supportedValuesOf('timeZone');
                this.cachedTimezones = timezones
                    .filter(tz => this.isValidTimezone(tz)) // Double-check validity
                    .map(tz => ({ name: tz, value: tz }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                
                console.log(`✅ Cached ${this.cachedTimezones.length} timezones from Intl.supportedValuesOf`);
            } else {
                // Fallback to common timezones if Intl.supportedValuesOf is not available
                console.log('⚠️ Intl.supportedValuesOf not available, using fallback common timezones');
                this.cachedTimezones = this.getCommonTimezones();
            }
        } catch (error) {
            console.error('❌ Error initializing timezones, falling back to common list:', error);
            this.cachedTimezones = this.getCommonTimezones();
        }
    }

    /**
     * Get the cached array of all timezones
     * @returns {Array} Array of timezone objects with name and value
     */
    getTimezoneArray() {
        return this.cachedTimezones;
    }

    /**
     * Validate a timezone identifier
     * @param {string} timezone - Timezone identifier to validate
     * @returns {boolean} True if valid, false otherwise
     */
    isValidTimezone(timezone) {
        try {
            // Reject null/undefined/empty values
            if (!timezone || typeof timezone !== 'string') {
                return false;
            }
            
            // Try to create a DateTime in the specified timezone
            const dt = DateTime.now().setZone(timezone);
            // Check if it's a valid zone
            return dt.isValid && dt.zoneName !== null;
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
        if (!this.isValidTimezone(timezone)) {
            throw new Error(`Invalid timezone: ${timezone}`);
        }

        try {
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
            throw error;
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
     * Get list of common timezones for autocomplete (fallback)
     * @returns {Array} Array of common timezone objects
     */
    getCommonTimezones() {
        return [
            { name: 'UTC', value: 'UTC' },
            { name: 'America/New_York', value: 'America/New_York' },
            { name: 'America/Chicago', value: 'America/Chicago' },
            { name: 'America/Denver', value: 'America/Denver' },
            { name: 'America/Los_Angeles', value: 'America/Los_Angeles' },
            { name: 'America/Anchorage', value: 'America/Anchorage' },
            { name: 'Pacific/Honolulu', value: 'Pacific/Honolulu' },
            { name: 'Europe/London', value: 'Europe/London' },
            { name: 'Europe/Paris', value: 'Europe/Paris' },
            { name: 'Europe/Berlin', value: 'Europe/Berlin' },
            { name: 'Europe/Rome', value: 'Europe/Rome' },
            { name: 'Europe/Moscow', value: 'Europe/Moscow' },
            { name: 'Asia/Tokyo', value: 'Asia/Tokyo' },
            { name: 'Asia/Shanghai', value: 'Asia/Shanghai' },
            { name: 'Asia/Kolkata', value: 'Asia/Kolkata' },
            { name: 'Asia/Jerusalem', value: 'Asia/Jerusalem' },
            { name: 'Australia/Sydney', value: 'Australia/Sydney' },
            { name: 'Australia/Melbourne', value: 'Australia/Melbourne' },
            { name: 'Pacific/Auckland', value: 'Pacific/Auckland' },
            { name: 'America/Toronto', value: 'America/Toronto' },
            { name: 'America/Vancouver', value: 'America/Vancouver' },
            { name: 'America/Mexico_City', value: 'America/Mexico_City' },
            { name: 'America/Sao_Paulo', value: 'America/Sao_Paulo' },
            { name: 'America/Argentina/Buenos_Aires', value: 'America/Argentina/Buenos_Aires' },
            { name: 'Asia/Dubai', value: 'Asia/Dubai' }
        ];
    }

    /**
     * Search timezones by name for autocomplete
     * @param {string} query - Search query
     * @returns {Array} Array of matching timezone objects
     */
    searchTimezones(query) {
        console.log(`🔍 TimezoneService.searchTimezones called with query: "${query}"`);
        
        const allTimezones = this.getTimezoneArray();
        console.log(`📋 Total timezones available: ${allTimezones.length} items`);
        
        // Trim the query and check if empty or too short
        const trimmedQuery = query ? query.trim() : '';
        if (!trimmedQuery || trimmedQuery.length < 2) {
            console.log(`⚡ Query too short, returning first 25 timezones`);
            const result = allTimezones.slice(0, 25);
            console.log(`📤 Returning ${result.length} timezone options`);
            return result;
        }
        
        const lowerQuery = trimmedQuery.toLowerCase();
        console.log(`🔎 Searching for: "${lowerQuery}"`);
        
        // Filter all timezones by name (since name === value now)
        const matches = allTimezones.filter(tz => {
            return tz.name.toLowerCase().includes(lowerQuery);
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
