# Use official oven/bun alpine base image
FROM oven/bun:1.0-alpine

WORKDIR /app

# Copy dependency manifests from toolsmith
COPY systems/toolsmith/package.json systems/toolsmith/bun.lock* ./systems/toolsmith/

# Install dependencies
RUN cd systems/toolsmith && bun install

# Copy source repository files
COPY . .

# Set default start command to run the polling bot
CMD ["bun", "run", "systems/toolsmith/scripts/telegram-bot.ts"]
