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

# ============================================================================
# CRITICAL PATCH VALIDATION
# These patches are required for Telegram to work. If any are missing, the
# Dockerfile was incorrectly modified. DO NOT REMOVE THESE CHECKS.
# See commit history for why each patch exists.
# ============================================================================
TGFILE="/app/node_modules/@elizaos/plugin-telegram/dist/index.js"
PATCH_ERRORS=""

if [ -f "$TGFILE" ]; then
    # Check 1: Env fallback (TELEGRAM_BOT_TOKEN from process.env)
    if grep -q "process.env.TELEGRAM_BOT_TOKEN" "$TGFILE"; then
        echo "[startup] ✅ Telegram patch: env fallback"
    else
        echo "[startup] ❌ MISSING: Telegram env fallback patch"
        PATCH_ERRORS="${PATCH_ERRORS}env-fallback "
    fi
    
    # Check 2: 90s timeout workaround (fire-and-forget message handling)
    if grep -q "void this.messageManager.handleMessage" "$TGFILE"; then
        echo "[startup] ✅ Telegram patch: 90s timeout workaround"
    else
        echo "[startup] ❌ MISSING: Telegram 90s timeout workaround"
        PATCH_ERRORS="${PATCH_ERRORS}90s-timeout "
    fi
    
    if [ -n "$PATCH_ERRORS" ]; then
        echo ""
        echo "=========================================="
        echo " CRITICAL: TELEGRAM PATCHES ARE MISSING"
        echo "=========================================="
        echo ""
        echo "Missing patches: $PATCH_ERRORS"
        echo ""
        echo "This means the Dockerfile was incorrectly modified."
        echo "Check Dockerfile for the telegram patching RUN commands."
        echo "See git history for the correct patch code."
        echo ""
        echo "Without these patches:"
        echo "  - env-fallback: Telegram won't get its bot token"
        echo "  - 90s-timeout: Slow LLM responses will crash the agent"
        echo ""
        echo "Refusing to start. Fix the Dockerfile and rebuild."
        exit 1
    fi
else
    echo "[startup] ⚠️ Telegram plugin not found (may be intentional)"
fi

exec bun --preload ./suppress-ai-warnings.js ./patches/postgres-unicode-safety-patch.js ./node_modules/@elizaos/cli/dist/index.js start --character ./character.json --port 3003
