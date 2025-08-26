# Twitter Plugin Rate Limit Fix

This fix addresses the issue where the @elizaos/plugin-twitter crashes the application when hitting Twitter API rate limits (HTTP 429 errors).

## Problem

The original Twitter plugin crashes when:
- Authentication/profile fetch receives 429 (Too Many Requests)
- Rate limit headers are not properly handled
- No graceful degradation to read-only mode

## Solution

This patch provides:
- ✅ Graceful handling of 429 errors during auth/profile fetch
- ✅ Detection and parsing of rate limit headers (`x-user-limit-24hour-*`)
- ✅ Automatic pause of write operations when rate limited
- ✅ Read-only mode continuation when rate capped
- ✅ Proper logging of rate limit status and retry times

## Files Added

1. **`twitter-patch.js`** - Main patch module that monkey-patches the Twitter plugin at runtime
2. **`start-with-twitter-patch.sh`** - Startup script that applies the patch before launching
3. **`TWITTER_RATE_LIMIT_FIX_README.md`** - This documentation

## How to Use

### Option 1: Use the Startup Script (Recommended)

Instead of running:
```bash
npm run start
# or
elizaos start --character ./character.json --port 3002
```

Use:
```bash
./start-with-twitter-patch.sh
```

### Option 2: Manual Application

If you prefer to apply the patch manually:

```bash
# Apply patch and start
NODE_OPTIONS="--require ./twitter-patch.js" elizaos start --character ./character.json --port 3002
```

### Option 3: Modify package.json

Update your `package.json` scripts:

```json
{
  "scripts": {
    "start": "NODE_OPTIONS=\"--require ./twitter-patch.js\" elizaos start --character ./character.json --port 3002",
    "start:patched": "./start-with-twitter-patch.sh"
  }
}
```

## How It Works

### Rate Limit Detection

The patch intercepts Twitter API calls and detects 429 errors with rate limit headers:

```javascript
// Example headers that trigger rate limiting
{
  "x-user-limit-24hour-limit": "25",
  "x-user-limit-24hour-remaining": "0",
  "x-user-limit-24hour-reset": "1756260515"
}
```

### Graceful Handling

When rate limited:
1. **Logs the issue** with retry time
2. **Pauses write operations** (tweets, follows, etc.)
3. **Continues in read-only mode** for timeline monitoring
4. **Automatically resumes** when rate limit resets

### Example Log Output

```
[TWITTER PATCH] Rate limited detected. Pausing operations until 2025-08-26T02:29:06.000Z
[TWITTER PATCH] Rate limit details: {
  limit: 25,
  remaining: 0,
  resetTime: "2025-08-26T02:29:06.000Z"
}
[TWITTER PATCH] Operations paused. 900 seconds remaining.
```

## API Changes

The patched Twitter plugin adds these methods:

```javascript
// Get current rate limit status
const status = twitterPlugin.getRateLimitStatus();
// Returns: { isRateLimited: true, retryAfter: 900, pausedUntil: Date }

// Check if operations should be paused
const shouldPause = twitterPlugin.shouldPauseOperations();
// Returns: true/false

// Enhanced TwitterAuth class
const auth = new twitterPlugin.TwitterAuth(...);
const rateLimitStatus = auth.getRateLimitStatus();
const shouldPauseWrites = auth.shouldPauseWrites();
```

## Testing the Fix

1. **Start with the patch:**
   ```bash
   ./start-with-twitter-patch.sh
   ```

2. **Monitor logs** for rate limit messages:
   ```bash
   pm2 logs elizaos-pixel-agent --lines 50
   ```

3. **Verify graceful handling** - the app should continue running even when rate limited

## Troubleshooting

### Patch Not Applied
- Check that the script is executable: `chmod +x start-with-twitter-patch.sh`
- Verify the patch loads: Look for `[TWITTER PATCH] Applying rate limit patch` in logs

### Still Crashing
- The patch may need updates for newer versions of @elizaos/plugin-twitter
- Check the Twitter API credentials and limits in your environment

### Rate Limits Not Detected
- Ensure your Twitter app has proper API access
- Check that the Twitter plugin is actually being used in your character configuration

## Technical Details

### Patch Mechanism

The patch uses Node.js `require` monkey-patching to intercept the Twitter plugin module loading:

```javascript
// Override require to patch the Twitter plugin
const originalRequire = require;
require = function(id) {
  const module = originalRequire(id);
  if (id === '@elizaos/plugin-twitter') {
    // Apply patches to module
    patchTwitterPlugin(module);
  }
  return module;
};
```

### Rate Limit Headers

The patch specifically looks for these Twitter API headers:
- `x-rate-limit-limit` - Total requests allowed
- `x-rate-limit-remaining` - Remaining requests
- `x-rate-limit-reset` - Reset timestamp
- `x-user-limit-24hour-limit` - 24-hour user limit
- `x-user-limit-24hour-remaining` - 24-hour remaining
- `x-user-limit-24hour-reset` - 24-hour reset timestamp

### Fallback Behavior

If headers can't be parsed, the patch defaults to:
- 15-minute retry period
- Read-only mode operation
- Conservative rate limiting

## Compatibility

- ✅ @elizaos/plugin-twitter v1.2.21
- ✅ Node.js 18+
- ✅ ElizaOS core v1.0.0+
- ✅ Works with existing character configurations

## Contributing

To improve the patch:
1. Test with different rate limit scenarios
2. Add more comprehensive error handling
3. Support additional Twitter API endpoints
4. Add metrics/monitoring integration

## License

This fix is provided as-is for resolving the rate limit crash issue. Use at your own risk.