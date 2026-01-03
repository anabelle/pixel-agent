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

# Patch telegram plugin's processImage to wrap imageUrl in object
# Fixes: "paramsObj is not an Object. (evaluating '"prompt" in paramsObj')"
# The code spans multiple lines, so we use perl for multi-line replacement
RUN perl -i -0pe 's/(this\.runtime\.useModel\(\s*ModelType\.IMAGE_DESCRIPTION,\s*)imageUrl(\s*\))/$1\{ imageUrl \}$2/g' \
    /app/node_modules/@elizaos/plugin-telegram/dist/index.js

# Patch Telegram token lookup to fall back to runtime env.
# build:character strips secrets, so TELEGRAM_BOT_TOKEN may be empty in character.json.
RUN perl -i -0pe 's/const botToken = runtime\.getSetting\("TELEGRAM_BOT_TOKEN"\);/const botToken = runtime.getSetting("TELEGRAM_BOT_TOKEN") || process.env.TELEGRAM_BOT_TOKEN;/g' \
    /app/node_modules/@elizaos/plugin-telegram/dist/index.js

# Patch telegram plugin handlers to avoid Telegraf's default 90s handler timeout.
# Do not await long-running message processing; log errors via promise .catch.
RUN perl -i -0pe 's/await this\.messageManager\.handleMessage\(ctx\);/void this.messageManager.handleMessage(ctx).catch((error) => logger3.error({ error }, "Error handling message"));/g; s/await this\.messageManager\.handleReaction\(ctx\);/void this.messageManager.handleReaction(ctx).catch((error) => logger3.error({ error }, "Error handling reaction"));/g' \
    /app/node_modules/@elizaos/plugin-telegram/dist/index.js

# Add an internal processing timeout for Telegram inbound messages.
# If the agent doesn't produce a response within TELEGRAM_HANDLER_MAX_MS (default 45000),
# send a short fallback reply so DMs don't silently hang forever.
RUN perl -i -0pe 's/await this\.runtime\.messageService\.handleMessage\(this\.runtime, memory, callback\);/let __tgReplied = false;\n      const __tgOriginalCallback = callback;\n      const __tgCallback = async (content, _files) => {\n        if (__tgReplied) return [];\n        __tgReplied = true;\n        return __tgOriginalCallback(content, _files);\n      };\n      const __tgTimeoutMs = Number(process.env.TELEGRAM_HANDLER_MAX_MS || 45000);\n      const __tgTimer = setTimeout(async () => {\n        if (__tgReplied) return;\n        __tgReplied = true;\n        try {\n          if (ctx.chat) {\n            await this.bot.telegram.sendMessage(ctx.chat.id, "sorry—i\x27m slow rn. try again in a bit", { reply_to_message_id: message.message_id });\n          }\n        } catch (e) {\n          logger2.error({ error: e }, "Telegram fallback send failed");\n        }\n      }, __tgTimeoutMs);\n      try {\n        await this.runtime.messageService.handleMessage(this.runtime, memory, __tgCallback);\n      } finally {\n        clearTimeout(__tgTimer);\n      }/g' \
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
