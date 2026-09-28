# Code review — Timey Zoney

## Fixed in this branch

| Bug | Cause | Fix |
|---|---|---|
| DST auto-switch never updated anyone | `dstService` injected helpers into `broadcastEval` with `eval()` of `const` declarations. `const` inside `eval` is scoped to the eval, so `removeTimezoneFromNickname` was undefined, every guild hit the `catch`, and the error was swallowed. | Shared `nicknameService` is attached to the client on each shard; `broadcastEval` calls `client.nicknameService.updateAcrossGuilds(...)`. |
| DST only checked 10 timezones | Timezones came from `getStats()`, which has `LIMIT 10`. | New `databaseService.getDistinctTimezones()`. |
| DST crashed in `npm run single` | `client.shard.broadcastEval` with no shard manager. | Falls back to the local client when `client.shard` is null. |
| Custom name replaced by @username | Base name was `member.nickname \|\| user.username`, ignoring Discord global display names. | `nicknameService.getBaseName` uses nickname → `globalName` → username. Used by set, clear, guildMemberUpdate and DST. |
| `/timezone set` wiped the user's server list | `INSERT OR REPLACE` deletes the row, and `ON DELETE CASCADE` removed every `user_servers` row. Users only ever got DST updates in the last server they ran the command in. | Upsert with `ON CONFLICT DO UPDATE`. |
| `set`/`clear` crashed in DMs or as a user-installed app | `interaction.guild` / `member` were null. | These commands are refused unless `interaction.inCachedGuild()`. |
| Permission gate crashed when the bot's member wasn't cached, and blocked `/help` + `/timezone time` over Manage Nicknames | It read `guild.members.me.permissions` and applied one list to every command. | Commands now opt in with `botPermissions`, checked against `interaction.appPermissions`. |
| Nickname edits attempted without Manage Nicknames | `member.manageable` only checks role hierarchy. | `nicknameService.getBlockReason` also checks the bot's Manage Nicknames permission. Used by set, clear, member update, join and DST. |
| Bot removal left data behind forever | No `guildDelete` handler. | The server's links are deleted, and users with no servers left get `deletion_date = now + 6 months`. Rejoining any server clears it. `npm run purge:users` (for cron) deletes expired users. |
| Dead files | `test-*.js` scratch scripts, empty `commands/time.js` / `handlers/eventHandler.js`. | Removed. |

## Remaining improvements (priority order)

### 1. DST design is fragile
The check only fires if the bot is up at exactly 05:00 local on changeover day. A restart or crash at that hour means users keep the wrong offset for six months.
**Better:** make it an idempotent reconcile. Store `applied_offset` per user; every hour, for each user where `currentOffset(tz) !== applied_offset`, update nicknames and store the new offset. It self-heals and removes the 5am logic entirely.

### 2. Servers the user was already in aren't tracked
`guildMemberAdd` now links known users and applies their timezone when they join a server. But servers they were *already* in when they ran `/timezone set` elsewhere still aren't linked. Consider an "apply everywhere" option on `/timezone set`. Also consider removing the link on `guildMemberRemove`.

### 2b. Slow replies
`/timezone set` awaits several cross-shard log broadcasts before it replies. Under load, that can pass Discord's 3-second deadline and fail with "Unknown interaction". Reply first, then log (or `deferReply`).

### 3. SRP — `commands/timezone.js` does everything (~450 lines)
It validates, writes to the DB, changes nicknames, builds 8 near-identical embeds and logs. Split into:
- `services/userTimezoneService.js` — `setTimezone(member, tz)` / `clearTimezone(member)` returning a result object (no Discord UI).
- `views/timezoneEmbeds.js` — pure functions `result → EmbedBuilder`.
- The command file just wires the two together.

### 4. DIP — everything `require`s singletons
Services import each other and `config/database` directly, which is why tests need `jest.mock` everywhere. Export classes, construct them once in `bot.js` (composition root) and pass dependencies in.

### 5. Database layer — done
Moved to Postgres (`pg`). Migrations are applied on startup under an advisory lock, and `run/get/all/transaction` helpers remove the callback boilerplate. The unused `dst_schedule` table has been dropped. After production has been migrated, delete `scripts/migrate-sqlite-to-postgres.js`, the `sqlite3` dependency and the Docker volume.

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
