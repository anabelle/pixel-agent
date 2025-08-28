#!/bin/bash

# Twitter Rate Limit Patch Startup Script
# This script applies the Twitter plugin rate limit patch before starting the application

echo "Applying Twitter rate limit patch..."

# Apply the patch by preloading the patch module
NODE_OPTIONS="--require ./twitter-patch.js" npx elizaos start --character ./character.json --port 3002