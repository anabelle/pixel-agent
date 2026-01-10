#!/bin/sh
# Startup wrapper for ElizaOS agent
set -e

echo "[startup] NODE_ENV=${NODE_ENV:-}" 
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    echo "[startup] TELEGRAM_BOT_TOKEN is set (len=${#TELEGRAM_BOT_TOKEN})"
else
    echo "[startup] TELEGRAM_BOT_TOKEN is MISSING"
fi

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

# Generate character.json from manifest (respects current .env)
bun scripts/build-character.ts

# Log character plugin list (no secrets)
bun -e 'const fs=require("fs"); const c=JSON.parse(fs.readFileSync("./character.json","utf8")); console.log("[startup] character plugins:", Array.isArray(c.plugins)?c.plugins.join(","):"<none>")'

# Confirm whether the telegram env-fallback patch is present in the built image
bun -e 'const fs=require("fs"); const p="/app/node_modules/@elizaos/plugin-telegram/dist/index.js"; try{ const s=fs.readFileSync(p,"utf8"); console.log("[startup] telegram env fallback patched:", s.includes("process.env.TELEGRAM_BOT_TOKEN")?"yes":"no"); } catch(e){ console.log("[startup] telegram plugin dist not found"); }'

exec bun --preload ./suppress-ai-warnings.js ./node_modules/@elizaos/cli/dist/index.js start --character ./character.json --port 3003
