FROM oven/bun:1-slim

WORKDIR /app

# Install build tools for native modules
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

# Create node and npm symlinks to bun for compatibility
RUN ln -s /usr/local/bin/bun /usr/local/bin/node && ln -s /usr/local/bin/bun /usr/local/bin/npm

# Build local plugin first
COPY plugin-nostr ./plugin-nostr
WORKDIR /app/plugin-nostr
RUN bun install
# No build step needed for JS plugin

# Back to app
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy source
COPY . .

# Build app (compiles TS and generates initial character.json)
RUN bun run build

# Expose port
EXPOSE 3002

# Start using bun
CMD ["/bin/sh", "-c", "bun run build:character && bunx @elizaos/cli@latest start --character ./character.json --port 3002"]
