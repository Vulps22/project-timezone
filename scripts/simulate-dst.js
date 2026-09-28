/**
 * Dry-run the DST detector for a timezone over a given day, without Discord or the database.
 *
 *   npm run dst:simulate -- Europe/London 2026-10-25
 *   npm run dst:simulate -- America/New_York 2026-11-01 "Vulps (UTC-4)"
 */
const { DateTime, Settings } = require('luxon');
const dstService = require('../services/dstService');
const timezoneService = require('../services/timezoneService');

const [timezone = 'Europe/London', date = DateTime.now().toISODate(), nickname = 'Example (UTC+0)'] = process.argv.slice(2);

if (!timezoneService.isValidTimezone(timezone)) {
    console.error(`Invalid timezone: ${timezone}`);
    process.exit(1);
}

// Silence the service's own chatter so only the table prints
const log = console.log;
console.log = () => {};

(async () => {
    const dayStart = DateTime.fromISO(date, { zone: 'utc' }).minus({ hours: 14 });
    const rows = [];

    // Walk every hour the scheduler would fire that could land on `date` locally
    for (let h = 0; h < 48; h++) {
        const at = dayStart.plus({ hours: h });
        const local = at.setZone(timezone);
        if (local.toISODate() !== date) continue;

        Settings.now = () => at.toMillis();
        const triggered = await dstService.checkTimezoneForDST(timezone, at);
        const nextNick = triggered ? timezoneService.formatNicknameWithTimezone(nickname, timezone, 'user') : '';
        rows.push({ utc: at.toFormat('HH:mm'), local: local.toFormat('HH:mm ZZ'), triggered, nickname: nextNick });
    }

    console.log = log;
    console.log(`DST check for ${timezone} on ${date}:`);
    console.table(rows);
    if (!rows.some(r => r.triggered)) console.log('No DST switch detected on this date.');
})();
