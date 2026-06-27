# Use official oven/bun alpine base image
FROM oven/bun:1.0-alpine

WORKDIR /app

# Copy lock and dependency manifests
COPY package.json ./

# Install dependencies (production only)
RUN bun install --production

# Copy source repository files
COPY . .

# Set default start command to run the polling bot
CMD ["bun", "run", "systems/toolsmith/scripts/telegram-bot.ts"]
