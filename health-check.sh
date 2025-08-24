#!/bin/bash

# ElizaOS Agent Health Check Script
echo "=== ElizaOS Agent Health Check ==="
echo "Timestamp: $(date)"
echo ""

# Check if PM2 process is running
echo "1. PM2 Process Status:"
pm2 status elizaos-pixel-agent --silent
if [ $? -eq 0 ]; then
    echo "✅ ElizaOS agent is running in PM2"
else
    echo "❌ ElizaOS agent is not running in PM2"
fi
echo ""

# Check API endpoints
echo "2. API Health Check:"
API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/server/ping)
if [ "$API_RESPONSE" = "200" ]; then
    echo "✅ API server is responding (HTTP $API_RESPONSE)"
else
    echo "❌ API server is not responding (HTTP $API_RESPONSE)"
fi
echo ""

# Check logs for recent activity
echo "3. Recent Activity (last 5 log entries):"
pm2 logs elizaos-pixel-agent --lines 5 --nostream
echo ""

echo "=== Health Check Complete ==="