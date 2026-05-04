#!/bin/sh
set -e

# Fix ownership of the database directory when mounted as a Docker volume.
# Named volumes are mounted at runtime and may have root ownership, which
# prevents the non-root discordbot user from creating the SQLite file.
chown -R discordbot:nodejs /app/database

exec su-exec discordbot "$@"
