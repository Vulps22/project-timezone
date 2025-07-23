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
USER discordbot

# Start the bot
CMD ["npm", "start"]
