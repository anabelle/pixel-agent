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

# Fix: Bun may create /app/node_modules/.bin/bun -> ../bun/bin/bun.exe (Windows binary)
# which causes ENOEXEC when the ElizaOS CLI tries to spawn `bun` as a subprocess.
# Force the local `bun` shim to point at the actual Bun binary in the image.
RUN if [ -e /app/node_modules/.bin/bun ]; then rm -f /app/node_modules/.bin/bun; fi && \
    ln -sf /usr/local/bin/bun /app/node_modules/.bin/bun

# Telegram token wiring: @elizaos/core strips unknown settings keys during character validation,
# so runtime.getSetting("TELEGRAM_BOT_TOKEN") can be empty even when the env var is set.
# Allow plugin-telegram to fall back to process.env.TELEGRAM_BOT_TOKEN.
# Also add explicit logging to diagnose token issues.
RUN set -ex; \
    TGFILE="/app/node_modules/@elizaos/plugin-telegram/dist/index.js"; \
    if [ -f "$TGFILE" ]; then \
      echo "[patch] Patching plugin-telegram for env fallback..."; \
      # Add env fallback for token
      perl -pi -e 's/const botToken = runtime\.getSetting\("TELEGRAM_BOT_TOKEN"\);/const botToken = runtime.getSetting("TELEGRAM_BOT_TOKEN") || process.env.TELEGRAM_BOT_TOKEN;/' "$TGFILE"; \
      # Add explicit logging to show token source
      perl -pi -e 's/(const botToken = .*?;)/\1\n    logger3.log("[TG-DEBUG] getSetting:", runtime.getSetting("TELEGRAM_BOT_TOKEN") ? "present" : "missing", "env:", process.env.TELEGRAM_BOT_TOKEN ? "present" : "missing", "final:", botToken ? "OK" : "EMPTY");/' "$TGFILE"; \
      # Verify patch applied
      grep -q "process.env.TELEGRAM_BOT_TOKEN" "$TGFILE" && echo "[patch] ✅ Telegram env fallback applied" || echo "[patch] ❌ Patch FAILED"; \
    else \
      echo "[patch] ⚠️ plugin-telegram not found at $TGFILE"; \
    fi

# CRITICAL: Patch telegram plugin handlers to avoid Telegraf's default 90s handler timeout.
# Do not await long-running message processing; log errors via promise .catch.
# Without this, slow LLM responses cause Telegraf to throw TimeoutError which crashes the agent.
RUN set -ex; \
    TGFILE="/app/node_modules/@elizaos/plugin-telegram/dist/index.js"; \
    if [ -f "$TGFILE" ]; then \
      echo "[patch] Patching plugin-telegram for 90s timeout workaround..."; \
      perl -i -0pe 's/await this\.messageManager\.handleMessage\(ctx\);/void this.messageManager.handleMessage(ctx).catch((error) => logger3.error({ error }, "Error handling message"));/g' "$TGFILE"; \
      perl -i -0pe 's/await this\.messageManager\.handleReaction\(ctx\);/void this.messageManager.handleReaction(ctx).catch((error) => logger3.error({ error }, "Error handling reaction"));/g' "$TGFILE"; \
      grep -q "void this.messageManager.handleMessage" "$TGFILE" && echo "[patch] ✅ 90s timeout workaround applied" || echo "[patch] ❌ 90s timeout patch FAILED"; \
    fi

# Fix "silent" Telegram failures:
# - If a webhook is set, polling (getUpdates) will fail (often as a 409 conflict)
# - The upstream code does not await bot.launch(), so launch errors are not caught by the retry loop
# This patch deletes any active webhook and awaits launch so failures are retried.
RUN set -ex; \
    TGFILE="/app/node_modules/@elizaos/plugin-telegram/dist/index.js"; \
    if [ -f "$TGFILE" ]; then \
      echo "[patch] Patching plugin-telegram for webhook cleanup..."; \
      perl -i -0pe 's/this\.bot\?\?\.launch\(\{\n\s*dropPendingUpdates: true,/try { await this.bot.telegram.deleteWebhook({ drop_pending_updates: true }); } catch (e) { logger3.warn("Failed to delete Telegram webhook (continuing): " + (e?.message || e)); }\n    await this.bot?.launch({\n      dropPendingUpdates: true,/g' "$TGFILE"; \
      echo "[patch] ✅ Webhook cleanup patch applied (best effort)"; \
    fi

# Prevent self-inflicted 409 loops: if launch fails and we retry, ensure any prior polling is stopped.
RUN set -ex; \
    TGFILE="/app/node_modules/@elizaos/plugin-telegram/dist/index.js"; \
    if [ -f "$TGFILE" ]; then \
      echo "[patch] Patching plugin-telegram for retry cleanup..."; \
      perl -i -0pe 's/(Telegram initialization attempt \$\{retryCount \+ 1\} failed:[^\n]*\n\s*\);\n\s*)retryCount\+\+;/\1try { service.bot?.stop(); } catch { }\n        retryCount++;/g' "$TGFILE"; \
      echo "[patch] ✅ Retry cleanup patch applied (best effort)"; \
    fi

# CRITICAL: ElizaOS CLI v1.7 changed messageService.handleMessage to RETURN results
# instead of calling the callback. Plugin v1.6.2 expects the callback to be called.
# This patch checks the return value's didRespond/responseContent and calls the callback.
RUN set -ex; \
    TGFILE="/app/node_modules/@elizaos/plugin-telegram/dist/index.js"; \
    if [ -f "$TGFILE" ]; then \
      echo "[patch] Patching plugin-telegram for messageService callback..."; \
      perl -i -0pe 's/await this\.runtime\.messageService\.handleMessage\(this\.runtime, memory, callback\);/const __tgResult = await this.runtime.messageService.handleMessage(this.runtime, memory, callback);\n      if (__tgResult \&\& __tgResult.didRespond \&\& __tgResult.responseContent) {\n        logger2.info({ responseLen: __tgResult.responseContent?.text?.length }, "Telegram: calling callback with response");\n        await callback(__tgResult.responseContent, []);\n      } else {\n        logger2.warn({ didRespond: __tgResult?.didRespond }, "Telegram: no response generated");\n      }/g' "$TGFILE"; \
      grep -q "__tgResult" "$TGFILE" && echo "[patch] ✅ messageService callback patch applied" || echo "[patch] ❌ messageService callback patch FAILED"; \
    fi

# Compatibility patch: In our current Postgres schema/runtime wiring, Room.serverId can be missing
# for GROUP contexts (Telegram). @elizaos/plugin-bootstrap's ROLES provider throws in that case,
# which breaks group message handling. Fall back to room.channelId and return empty roles.
RUN set -e; \
        for f in \
            /app/node_modules/@elizaos/plugin-bootstrap/dist/index.js \
            /app/node_modules/@elizaos/server/node_modules/@elizaos/plugin-bootstrap/dist/index.js \
        ; do \
            if [ -f "$f" ]; then \
                perl -pi -e 's/const serverId = room\\.serverId;/const serverId = room.serverId || room.channelId;/' "$f"; \
                perl -pi -e 's/throw new Error\("No server ID found"\);/return { data: { roles: [] }, values: { roles: "No role information available for this server." }, text: "No role information available for this server." };/g' "$f"; \
            fi; \
        done

# Stability patch: @elizaos/core useModel() assumes params is an object and uses the `in` operator.
# Some callers (notably in media-processing paths) can pass a non-object, which crashes the whole agent.
# This guards those checks so non-object params don't throw.
RUN set -e; \
        for f in \
            /app/node_modules/@elizaos/core/dist/node/index.node.js \
            /app/node_modules/@elizaos/server/node_modules/@elizaos/core/dist/node/index.node.js \
            /app/node_modules/@elizaos/cli/node_modules/@elizaos/core/dist/node/index.node.js \
        ; do \
            if [ -f "$f" ]; then \
                perl -pi -e 's/paramsObj && "prompt" in paramsObj/paramsObj && typeof paramsObj === "object" && "prompt" in paramsObj/g' "$f"; \
                perl -pi -e 's/paramsObj && "input" in paramsObj/paramsObj && typeof paramsObj === "object" && "input" in paramsObj/g' "$f"; \
                perl -pi -e 's/paramsObj && "messages" in paramsObj/paramsObj && typeof paramsObj === "object" && "messages" in paramsObj/g' "$f"; \
            fi; \
        done

# Copy source files
COPY . .

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
