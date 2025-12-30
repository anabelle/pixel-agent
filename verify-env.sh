#!/bin/bash

# Configuration Verification Script
# Checks if all required environment variables are set

# Load .env if it exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

MISSING_VARS=0

echo "Checking environment variables..."

# Check Twitter (OAuth 1.0a)
if [ -z "$TWITTER_API_KEY" ] || [ -z "$TWITTER_API_SECRET_KEY" ] || [ -z "$TWITTER_ACCESS_TOKEN" ] || [ -z "$TWITTER_ACCESS_TOKEN_SECRET" ]; then
    echo "❌ Missing Twitter OAuth credentials (TWITTER_API_KEY, TWITTER_API_SECRET_KEY, etc.)"
    MISSING_VARS=1
else
    echo "✅ Twitter credentials set"
fi

# Check Discord
if [ -z "$DISCORD_API_TOKEN" ]; then
    echo "❌ Missing DISCORD_API_TOKEN"
    MISSING_VARS=1
else
    echo "✅ Discord token set"
fi

# Check Database
if [ -z "$DATABASE_URL" ] && [ -z "$POSTGRES_URL" ]; then
    echo "⚠️  Missing DATABASE_URL or POSTGRES_URL. Agent may default to SQLite or fail if SQL plugin is enabled."
else
    echo "✅ Database URL set"
fi

if [ $MISSING_VARS -eq 1 ]; then
    echo ""
    echo "Please update your .env file with the missing variables."
    echo "Refer to .env.example for the required format."
    exit 1
else
    echo ""
    echo "Environment check passed!"
    exit 0
fi
