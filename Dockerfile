FROM oven/bun:1-slim

WORKDIR /app

# Install build tools for native modules (sharp, onnxruntime, telegram)
# Use --no-install-recommends to keep image small
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    libvips-dev \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create node and npm shims for compatibility with packages that expect Node.js
# The npm shim handles: 
#   - 'npm view' for @elizaos/cli update checks
#   - Falls back to bun for everything else
RUN ln -sf /usr/local/bin/bun /usr/local/bin/node && \
    printf '#!/bin/sh\ncase "$1" in\n  view) echo "1.7.0"; exit 0;;\n  *) exec /usr/local/bin/bun "$@";;\nesac\n' > /usr/local/bin/npm && \
    chmod +x /usr/local/bin/npm

# Build local Nostr plugin first (isolated to allow caching)
COPY plugin-nostr ./plugin-nostr
WORKDIR /app/plugin-nostr
RUN bun install --frozen-lockfile || bun install

# Back to main app
WORKDIR /app

# Copy package files first for better layer caching
COPY package.json bun.lock* ./

# Install dependencies with native module support
# --trust: allows postinstall scripts for sharp/onnxruntime
RUN bun install --trust

# Copy source files
COPY . .

# Patch Telegram token lookup to fall back to runtime env.
# build:character strips secrets, so TELEGRAM_BOT_TOKEN may be empty in character.json.
RUN perl -i -0pe 's/const botToken = runtime\.getSetting\("TELEGRAM_BOT_TOKEN"\);/const botToken = runtime.getSetting("TELEGRAM_BOT_TOKEN") || process.env.TELEGRAM_BOT_TOKEN;/g' \
    /app/node_modules/@elizaos/plugin-telegram/dist/index.js

# Patch telegram plugin handlers to avoid Telegraf's default 90s handler timeout.
# Do not await long-running message processing; log errors via promise .catch.
RUN perl -i -0pe 's/await this\.messageManager\.handleMessage\(ctx\);/void this.messageManager.handleMessage(ctx).catch((error) => logger3.error({ error }, "Error handling message"));/g; s/await this\.messageManager\.handleReaction\(ctx\);/void this.messageManager.handleReaction(ctx).catch((error) => logger3.error({ error }, "Error handling reaction"));/g' \
    /app/node_modules/@elizaos/plugin-telegram/dist/index.js

# CRITICAL: ElizaOS CLI v1.7 changed messageService.handleMessage to RETURN results
# instead of calling the callback. Plugin v1.6.2 expects the callback to be called.
# This patch checks the return value's didRespond/responseContent and calls the callback.
RUN perl -i -0pe 's/await this\.runtime\.messageService\.handleMessage\(this\.runtime, memory, callback\);/const __tgResult = await this.runtime.messageService.handleMessage(this.runtime, memory, callback);\n      if (__tgResult \&\& __tgResult.didRespond \&\& __tgResult.responseContent) {\n        logger2.info({ responseLen: __tgResult.responseContent?.text?.length }, "Telegram: calling callback with response");\n        await callback(__tgResult.responseContent, []);\n      } else {\n        logger2.warn({ didRespond: __tgResult?.didRespond }, "Telegram: no response generated");\n      }/g' \
    /app/node_modules/@elizaos/plugin-telegram/dist/index.js

# Build TypeScript and generate character.json
RUN bun run build && bun run build:character

# Expose the agent port
EXPOSE 3003

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD wget --spider -q http://localhost:3003/health || exit 1

# Copy startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Start agent via wrapper script for better debugging
CMD ["/app/start.sh"]
