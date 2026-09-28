# Timey Zoney Discord Bot - Docker Setup

## Quick Start

1. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your Discord bot token and channel IDs
   ```

2. **Build and run:**
   ```bash
   docker-compose up -d
   ```

3. **Check logs:**
   ```bash
   docker-compose logs -f timezone-bot
   ```

## Docker Commands

### Basic Operations
```bash
# Build and start
docker-compose up -d

# Stop
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# View logs
docker-compose logs timezone-bot
docker-compose logs -f timezone-bot  # Follow logs
```

### Database Management
The bot uses an external Postgres database set by `DATABASE_URL`. Back it up with your provider's tools, or `pg_dump "$DATABASE_URL" > backup.sql`.

Migrating the old SQLite volume (one-off, safe to re-run):
```bash
docker compose run --rm bot npm run db:migrate-sqlite
```

### Maintenance
```bash
# Update bot (rebuild with new code)
docker-compose down
git pull
docker-compose up -d --build

# View container stats
docker stats timey-zoney-bot

# Shell into running container
docker exec -it timey-zoney-bot sh
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Your Discord bot token | Yes |
| `DATABASE_URL` | Postgres connection URL (or use `PGHOST`/`PGUSER`/...) | Yes |
| `DATABASE_POOL_SIZE` | Connections per shard (default 5) | No |
| `DATABASE_SSL` | `true` for providers that require TLS | No |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `false` to allow self-signed certificates | No |
| `DISCORD_LOG_CHANNEL` | Channel ID for general logs | No |
| `DISCORD_ERROR_CHANNEL` | Channel ID for error logs | No |
| `DISCORD_LOGGER_WEBHOOK` | Webhook URL for fallback logging | No |
| `NODE_ENV` | Environment mode (production/development) | No |

## Security Features

- Non-root user (`discordbot`) inside container
- Resource limits to prevent memory issues
- Health checks for container monitoring
- Minimal attack surface with Alpine Linux

## Troubleshooting

### Bot won't start:
```bash
docker-compose logs timezone-bot
```

### Database issues:
```bash
# Check the bot can reach Postgres
docker compose run --rm bot node -e "require('./config/database').connect().then(() => process.exit(0))"
```

### Memory issues:
```bash
# Check resource usage
docker stats timey-zoney-bot

# Adjust memory limits in docker-compose.yml
```
