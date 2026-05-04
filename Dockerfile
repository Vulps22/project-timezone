# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in container
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create database directory (will be mounted as volume)
RUN mkdir -p /app/database

# Expose port (if needed for health checks or future web interface)
EXPOSE 3000

# Set user for security (optional but recommended)
RUN addgroup -g 1001 -S nodejs
RUN adduser -S discordbot -u 1001
RUN chown -R discordbot:nodejs /app

# Install su-exec so the entrypoint can drop privileges after fixing volume ownership
RUN apk add --no-cache su-exec

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Entrypoint runs as root to fix /app/database ownership (Docker volumes may
# be mounted with root ownership), then drops to discordbot via su-exec.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]
