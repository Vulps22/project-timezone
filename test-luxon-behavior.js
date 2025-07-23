const { DateTime } = require('luxon');

console.log('Testing Luxon timezone behavior...');

// Test various invalid timezones
const testTimezones = [
    'Invalid/Timezone',
    'America/FakeCity', 
    'NotATimezone',
    '',
    null,
    undefined
];

testTimezones.forEach(timezone => {
    try {
        console.log(`\nTesting: ${timezone}`);
        const dt = DateTime.now().setZone(timezone);
        console.log(`  DateTime created, isValid: ${dt.isValid}`);
        console.log(`  Zone: ${dt.zoneName}`);
        console.log(`  Offset: ${dt.offset}`);
    } catch (error) {
        console.log(`  Error: ${error.message}`);
    }
});
