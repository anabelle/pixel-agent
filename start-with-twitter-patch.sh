#!/bin/bash

# ElizaOS Plugin Patches Startup Script
# This script applies the following patches before starting the application:
# 1. Twitter rate limit patch - Gracefully handles Twitter API rate limits
# 2. WorldId patch - Ensures worldId is always set on Memory objects (fixes Telegram plugin)

echo "Applying runtime patches..."

# Apply both patches by preloading the patch modules
# Note: telegram-worldid-patch.js also ensures unique is boolean (not integer)
NODE_OPTIONS="--require ./twitter-patch.js --require ./telegram-worldid-patch.js" npx elizaos start --character ./character.json --port 3002