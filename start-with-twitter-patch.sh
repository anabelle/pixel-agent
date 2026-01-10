#!/bin/bash

# ElizaOS Plugin Patches Startup Script
# This script applies the following patches before starting the application:
# 1. Twitter rate limit patch - Gracefully handles Twitter API rate limits
# 2. (Removed) Telegram-related runtime patches

echo "Applying runtime patches..."

# Apply the twitter patch by preloading the patch module
NODE_OPTIONS="--require ./twitter-patch.js" npx elizaos start --character ./character.json --port 3002