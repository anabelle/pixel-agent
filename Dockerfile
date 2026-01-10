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
