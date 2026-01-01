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

# Build TypeScript and generate character.json
RUN bun run build && bun run build:character

# Expose the agent port
EXPOSE 3003

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --spider -q http://localhost:3003/health || exit 1

# Start agent directly (logs go to stdout for docker logs)
# --preload flag sets AI_SDK_LOG_WARNINGS=false before the AI SDK loads
CMD ["bun", "--preload", "./suppress-ai-warnings.js", "./node_modules/@elizaos/cli/dist/index.js", "start", "--character", "./character.json", "--port", "3003"]
