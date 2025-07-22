# Project Timezone

A Discord bot that automatically manages timezone displays in user nicknames across Discord servers.

## Description

This Discord bot automatically appends UTC offset information to user nicknames (e.g., `(UTC+2)` or `(UTC-5)`) and handles daylight saving time changes automatically. Users set their timezone once, and the bot keeps their nickname updated across all servers where the bot is present.

## Features

### Core Functionality
- **`/timezone <timezone>`** - Set your timezone (e.g., `/timezone America/New_York`)
- **Automatic nickname updates** - Bot appends `(UTC±X)` to your nickname
- **Multi-server support** - Your timezone follows you across all servers with this bot
- **Daylight saving time handling** - Automatic updates when DST changes occur
- **Immediate updates** - Nickname updated as soon as you join a new server

### Additional Commands
- **`/time @user`** - View another user's current time (ephemeral response)
- **`/timezone delete`** - Remove all your data from the bot (GDPR compliance)

### Smart DST Management
- Tracks upcoming DST changes for all user timezones
- Checks for midnight transitions hourly to catch DST changes
- Updates affected users' nicknames automatically across all their servers

### Nickname Protection
- Monitors nickname changes and re-applies timezone offset if removed
- Ensures timezone information persists even if users modify their nicknames
- Maintains consistent timezone display across all servers

### Permission Handling
- If the bot can't update your nickname during command usage, you'll see an ephemeral error message
- For automatic updates (DST changes, nickname monitoring), you'll receive a DM notification if permissions are insufficient
- Bot requires "Manage Nicknames" permission in servers

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Setup

1. Create a Discord application and bot at [Discord Developer Portal](https://discord.com/developers/applications)
2. Copy your bot token
3. Create a `.env` file in the root directory and add your bot token:
   ```
   DISCORD_TOKEN=your_bot_token_here
   ```

## Usage

To run the bot:
```bash
npm start
```

## Technical Implementation

### Database Design (SQLite)
- **users table**: `user_id`, `timezone_identifier`, `created_at`
- **user_servers table**: `user_id`, `server_id`, `joined_at`
- **dst_schedule table**: `timezone`, `next_change_date`, `next_offset`

### Key Libraries
- **discord.js** - Discord API interaction
- **sqlite3** - Local database storage
- **luxon** or **moment-timezone** - Timezone and DST calculations

### DST Update Strategy
1. Store next DST change date for each timezone in use
2. Hourly check for midnight transitions globally
3. Update affected users when their timezone experiences DST change
4. Rebuild DST schedule as needed

### Nickname Monitoring Strategy
1. Listen for `guildMemberUpdate` events to detect nickname changes
2. Check if user has timezone set and if timezone offset is missing from nickname
3. Re-apply timezone offset to maintain consistency
4. Handle edge cases where nickname length limits prevent adding offset

## Dependencies

- [discord.js](https://discord.js.org/) - Discord API library
- [sqlite3](https://www.npmjs.com/package/sqlite3) - SQLite database driver
- [luxon](https://moment.github.io/luxon/) - Timezone handling library

## Bot Permissions Required

- **Send Messages** - For command responses and error messages
- **Manage Nicknames** - To update user nicknames with timezone info
- **Use Slash Commands** - For `/timezone` and `/time` commands

## Example Usage

```
User: /timezone America/New_York
Bot: ✅ Timezone set to America/New_York (UTC-5). Your nickname will be updated across all servers.

[User's nickname changes from "John" to "John (UTC-5)"]

[User changes nickname to "Johnny" - bot automatically updates to "Johnny (UTC-5)"]

[When DST kicks in, nickname automatically updates to "Johnny (UTC-4)"]
```

## Privacy & Data

- Only stores: Discord User ID, chosen timezone, and server associations
- Full data deletion available via `/timezone delete`
- No personal information or message content stored
- GDPR compliant

## Contributing

Feel free to contribute to this project by opening issues or submitting pull requests.

## License

ISC
