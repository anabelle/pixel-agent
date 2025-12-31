FROM oven/bun:1-slim

# Set environment to production
ENV NODE_ENV=production

WORKDIR /app

# Install build tools for native modules (sharp, onnxruntime, telegram)
# Use --no-install-recommends to keep image small
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    curl \
    unzip \
    libvips-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create node and npm shims for compatibility with packages that expect Node.js
RUN ln -sf /usr/local/bin/bun /usr/local/bin/node && \
    printf '#!/bin/sh\ncase "$1" in\n  view) echo "1.7.0"; exit 0;;\n  *) exec /usr/local/bin/bun "$@";;\nesac\n' > /usr/local/bin/npm && \
    chmod +x /usr/local/bin/npm

# Prepare workspace - create directories as root but chown to bun immediately
RUN mkdir -p /app/.eliza /app/dist /app/logs && chown -R bun:bun /app

# Switch to non-root user for everything else
USER bun

# Build local Nostr plugin
COPY --chown=bun:bun plugin-nostr ./plugin-nostr
WORKDIR /app/plugin-nostr
RUN bun install --frozen-lockfile || bun install

# Back to main app and install dependencies
WORKDIR /app
COPY --chown=bun:bun package.json bun.lock* ./
RUN bun install --trust

# Fix Telegram plugin image processing bug (useModel expects object, not string)
RUN sed -i 's/ModelType.IMAGE_DESCRIPTION,$/ModelType.IMAGE_DESCRIPTION,/' \
    node_modules/@elizaos/plugin-telegram/dist/index.js && \
    sed -i 's/          imageUrl$/          { imageUrl }/' \
    node_modules/@elizaos/plugin-telegram/dist/index.js

# Copy source and build
COPY --chown=bun:bun . .
RUN bun run build && bun run build:character

# Expose the agent port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1

# Start
CMD ["bun", "-r", "./suppress-warnings.ts", "./node_modules/@elizaos/cli/dist/index.js", "start", "--character", "./character.json", "--port", "3003"]
