# Code review — Timey Zoney

## Fixed in this branch

| Bug | Cause | Fix |
|---|---|---|
| DST auto-switch never updated anyone | `dstService` injected helpers into `broadcastEval` with `eval()` of `const` declarations. `const` inside `eval` is scoped to the eval, so `removeTimezoneFromNickname` was undefined, every guild hit the `catch`, and the error was swallowed. | Shared `nicknameService` is attached to the client on each shard; `broadcastEval` calls `client.nicknameService.updateAcrossGuilds(...)`. |
| DST only checked 10 timezones | Timezones came from `getStats()`, which has `LIMIT 10`. | New `databaseService.getDistinctTimezones()`. |
| DST crashed in `npm run single` | `client.shard.broadcastEval` with no shard manager. | Falls back to the local client when `client.shard` is null. |
| Custom name replaced by @username | Base name was `member.nickname \|\| user.username`, ignoring Discord global display names. | `nicknameService.getBaseName` uses nickname → `globalName` → username. Used by set, clear, guildMemberUpdate and DST. |
| Dead files | `test-*.js` scratch scripts, empty `commands/time.js` / `handlers/eventHandler.js`. | Removed. |

## Remaining improvements (priority order)

### 1. DST design is fragile
The check only fires if the bot is up at exactly 05:00 local on changeover day. A restart or crash at that hour means users keep the wrong offset for six months.
**Better:** make it an idempotent reconcile. Store `applied_offset` per user; every hour, for each user where `currentOffset(tz) !== applied_offset`, update nicknames and store the new offset. It self-heals and removes the 5am logic entirely.

### 2. Only one server is tracked per `/timezone set`
`user_servers` gets a row only for the guild the command ran in. Other shared servers are never updated. `guildMemberAdd` has a TODO for this. Apply the saved timezone on join, and on `/timezone set` offer "apply everywhere".

### 3. SRP — `commands/timezone.js` does everything (~450 lines)
It validates, writes to the DB, changes nicknames, builds 8 near-identical embeds and logs. Split into:
- `services/userTimezoneService.js` — `setTimezone(member, tz)` / `clearTimezone(member)` returning a result object (no Discord UI).
- `views/timezoneEmbeds.js` — pure functions `result → EmbedBuilder`.
- The command file just wires the two together.

### 4. DIP — everything `require`s singletons
Services import each other and `config/database` directly, which is why tests need `jest.mock` everywhere. Export classes, construct them once in `bot.js` (composition root) and pass dependencies in.

### 5. DRY — database layer
Every method repeats the `new Promise((resolve, reject) => db.x(..., cb))` wrapper. Add `run/get/all` helpers (or use `better-sqlite3`, which is sync and faster). Replace the `INSERT OR REPLACE ... CASE WHEN EXISTS` subqueries with `INSERT ... ON CONFLICT(user_id) DO UPDATE`. `dst_schedule` is never used. Table creation runs in parallel with no migrations.

### 6. DRY — misc
- Three ways of sending ephemeral replies (`ephemeral: true`, `flags: ['Ephemeral']`, `MessageFlags.Ephemeral`). `ephemeral` is deprecated; use `MessageFlags.Ephemeral` everywhere.
- The `(UTC±x)` regex is written twice in `timezoneService`; make it a constant.
- `commandHandler` and `eventLoader` share their load/reload logic, and the reload methods are never called.

### 7. Behaviour issues
- `ready.js` registers global commands from **every shard on every boot** (rate-limit risk). Move to a `scripts/deploy-commands.js`.
- `setActivity(..., { type: 'WATCHING' })` isn't valid in v14; use `ActivityType.Watching`.
- `/help` and `/timezone time` are blocked if the bot lacks Manage Nicknames.
- Any `unhandledRejection` shuts the shard down.
- Every command sends 2–3 log messages through `broadcastEval` to every shard. That's noisy, and it's slow at scale. Use a levelled logger and only send warnings/errors to Discord.
- Offsets like Nepal show as `UTC+5.75`; `UTC+5:45` reads better.
- `guildMemberUpdate` re-adds the suffix whenever a user removes it. That might be intended, but users can't opt out per server.

### 8. Tooling
- `test.yml`: `docker build --dry-run` isn't a real flag, and `npm test` runs twice.
- No ESLint config.

## Suggested layout
```
src/
  bot.js, index.js            # composition root / shard manager
  commands/                   # thin: parse options → call service → render view
  events/
  services/                   # nicknameService, userTimezoneService, dstService, timezoneService
  repositories/               # userRepository, userServerRepository (SQL only)
  views/                      # embed builders
  infra/                      # database, logger, config, clientProvider
scripts/                      # deploy-commands, simulate-dst
tests/                        # mirrors src/
```
