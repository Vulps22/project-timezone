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
```bash
# List volumes
docker volume ls

# Inspect the database volume
docker volume inspect project-timezone_timezone-data

# Backup database
docker run --rm -v project-timezone_timezone-data:/data -v $(pwd):/backup alpine tar czf /backup/database-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .

# Restore database
docker run --rm -v project-timezone_timezone-data:/data -v $(pwd):/backup alpine tar xzf /backup/database-backup.tar.gz -C /data

# Access database directly (for debugging)
docker run --rm -it -v project-timezone_timezone-data:/data alpine sh
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

## Volume Persistence

The database is stored in a Docker named volume `timezone-data` which:
- ✅ Persists across container restarts
- ✅ Survives container deletion  
- ✅ Maintains data during updates
- ✅ Can be backed up and restored
- ✅ Is managed by Docker for optimal performance

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Your Discord bot token | Yes |
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
# Check if volume exists
docker volume ls | grep timezone-data

# Check volume mount
docker exec -it timey-zoney-bot ls -la /app/database
```

### Memory issues:
```bash
# Check resource usage
docker stats timey-zoney-bot

# Adjust memory limits in docker-compose.yml
```
