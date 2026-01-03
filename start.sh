#!/bin/sh
# Startup wrapper for ElizaOS agent
set -e

# Wait for PostgreSQL if configured
if [ -n "$POSTGRES_URL" ]; then
    PG_HOST=$(echo "$POSTGRES_URL" | sed -E 's|.*@([^:/]+).*|\1|')
    echo "[startup] Waiting for PostgreSQL at $PG_HOST..."
    for i in 1 2 3 4 5 6 7 8 9 10; do
        if nc -z "$PG_HOST" 5432 2>/dev/null; then
            echo "[startup] PostgreSQL is ready"
            break
        fi
        sleep 2
    done
fi

exec bun --preload ./suppress-ai-warnings.js ./node_modules/@elizaos/cli/dist/index.js start --character ./character.json --port 3003
