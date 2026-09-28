# Testing

```bash
npm test                 # all Jest tests (DB tests skipped)
TEST_DATABASE_URL=postgres://postgres@localhost:5432/timezone_test npm test   # include DB tests
npm run test:coverage
```

| File | Covers |
|---|---|
| `services/tests/timezoneService.test.js` | Validation, offsets, nickname suffix formatting |
| `services/tests/nicknameService.test.js` | Base-name choice (nickname / global display name / username), owner & permission skips |
| `services/tests/databaseService.test.js` | Real Postgres: upserts, server removal, scheduled deletion, purge, transactions. **Skipped unless `TEST_DATABASE_URL` is set** (that database gets wiped) |
| `services/tests/dstService.test.js` | Scheduler lifecycle and detection logic (mocked) |
| `services/tests/dstSimulation.test.js` | **End-to-end DST switch**: real Luxon with a frozen clock and fake multi-shard Discord guilds |

## Testing the DST auto-switch

### Automated
`dstSimulation.test.js` freezes Luxon's clock (`Settings.now`) at 05:00 on real changeover dates, then runs `dstService.checkDSTChanges()`. It asserts that the fake members' nicknames actually changed, both through `broadcastEval` and in non-sharded mode.

### Manual dry run (no Discord, no DB)
```bash
npm run dst:simulate -- Europe/London 2026-10-25 "Vulps (UTC+1)"
npm run dst:simulate -- America/New_York 2026-11-01
```
This prints every hourly check for that local day, whether it would fire, and the resulting nickname.

### Live test on a dev bot
Set a user to a timezone whose clocks change soon, or temporarily call `dstService.checkDSTChanges(DateTime.fromISO('<changeover date>T05:00', { zone: '<tz>' }))` from `ready.js`. Note that the nickname offset is always taken from the real current time, so a live run only changes names when the real offset differs from the one in the nickname.
