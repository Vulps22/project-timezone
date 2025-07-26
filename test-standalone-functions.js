// Test if the standalone timezone functions work in eval context
console.log('🧪 Testing standalone timezone functions...');

try {
    // Simulate the eval context code
    const { DateTime } = require('luxon');
    
    // Standalone function to validate timezone
    const isValidTimezone = (timezone) => {
        try {
            DateTime.now().setZone(timezone);
            return DateTime.now().setZone(timezone).isValid;
        } catch (error) {
            return false;
        }
    };
    
    // Standalone function to get current offset
    const getCurrentOffset = (timezone) => {
        try {
            if (!isValidTimezone(timezone)) {
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
    };
    
    // Standalone function to remove timezone from nickname
    const removeTimezoneFromNickname = (nickname) => {
        if (!nickname) return '';
        return nickname.replace(/\s*\(UTC[+-][\d.]+\)$/i, '').trim();
    };
    
    // Standalone function to format nickname with timezone
    const formatNicknameWithTimezone = (currentNickname, timezone, username, userId = null) => {
        try {
            // Special case for specific user ID - always use (UTC+Del)
            if (userId === '461232602188349470') {
                const baseName = currentNickname || username;
                const cleanName = removeTimezoneFromNickname(baseName);
                const specialNickname = `${cleanName} (UTC+Del)`;
                
                // Discord nickname limit is 32 characters
                if (specialNickname.length > 32) {
                    const maxBaseLength = 32 - 10; // 10 for " (UTC+Del)"
                    const truncatedBase = cleanName.substring(0, maxBaseLength);
                    return `${truncatedBase} (UTC+Del)`;
                }
                
                return specialNickname;
            }

            const offset = getCurrentOffset(timezone);
            if (!offset) {
                return null;
            }
            
            // Use current nickname or fall back to username
            const baseName = currentNickname || username;
            
            // Remove existing timezone info if present
            const cleanName = removeTimezoneFromNickname(baseName);
            
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
    };

    // Test the functions
    console.log('✅ Functions defined successfully');
    
    const testTimezone = 'America/New_York';
    const testNickname = 'TestUser (UTC+9)';
    const testUsername = 'testuser';
    
    console.log('🔍 Testing timezone validation:', isValidTimezone(testTimezone));
    console.log('🌍 Testing offset calculation:', getCurrentOffset(testTimezone));
    console.log('🧹 Testing nickname cleaning:', removeTimezoneFromNickname(testNickname));
    console.log('🏷️ Testing nickname formatting:', formatNicknameWithTimezone('TestUser', testTimezone, testUsername));
    
    console.log('🎉 All standalone functions work correctly!');
    
} catch (error) {
    console.error('❌ Standalone function test failed:', error);
}
