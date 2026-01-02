# Twitter Plugin Documentation

## Overview

The Twitter plugin allows Pixel to post content to X (formerly Twitter) using OAuth 1.0a authentication.

## Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|-----------|-------------|----------|
| `TWITTER_API_KEY` | Yes | Your Twitter API Key | `your_api_key` |
| `TWITTER_API_SECRET_KEY` | Yes | Your Twitter API Secret Key | `your_api_secret_key` |
| `TWITTER_ACCESS_TOKEN` | Yes | Your Twitter Access Token | `your_access_token` |
| `TWITTER_ACCESS_TOKEN_SECRET` | Yes | Your Twitter Access Token Secret | `your_access_token_secret` |
| `ENABLE_TWITTER_PLUGIN` | No | Enable/disable Twitter plugin | `true` or `false` |
| `TWITTER_POST_ENABLE` | No | Enable automatic posting | `true` |
| `TWITTER_POST_INTERVAL_MIN` | No | Minimum posting interval (seconds) | `120` |
| `TWITTER_POST_INTERVAL_MAX` | No | Maximum posting interval (seconds) | `240` |

### Getting Twitter Credentials

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new app
3. Generate OAuth 1.0a credentials
4. Add all four credentials to your `.env` file

## Usage

### Enable Twitter Plugin

1. Add credentials to `.env`:
   ```bash
   TWITTER_API_KEY=your_key
   TWITTER_API_SECRET_KEY=your_secret
   TWITTER_ACCESS_TOKEN=your_token
   TWITTER_ACCESS_TOKEN_SECRET=your_token_secret
   ENABLE_TWITTER_PLUGIN=true
   ```

2. Restart the agent:
   ```bash
   docker compose restart agent
   ```

### Disable Twitter Plugin

To disable Twitter plugin without removing credentials:

```bash
# Set in .env
ENABLE_TWITTER_PLUGIN=false

# Restart the agent
docker compose restart agent
```

## Error Handling

### 401 Unauthorized

If Twitter returns 401 (authentication failed):
- The plugin will log an error message
- The Twitter client will be disabled
- The agent will continue running with other plugins enabled
- Other plugins (Nostr, Telegram, Discord) are not affected

### Rate Limiting

The plugin includes intelligent rate limit handling:
- Parses Twitter rate limit headers
- Automatically pauses when rate limited
- Continues gracefully after rate limit expires
- Logs remaining quota information

### Graceful Failure

If credentials are missing or invalid:
- Plugin logs warning at startup
- Service is disabled but agent continues running
- No errors thrown to prevent agent crashes

## Testing

### Manual Testing

```bash
# Check if Twitter plugin is running
docker logs pixel-agent-1 2>&1 | grep -i twitter

# Check for authentication errors
docker logs pixel-agent-1 2>&1 | grep -i "401\|authentication failed"

# Check for rate limiting
docker logs pixel-agent-1 2>&1 | grep -i "rate limit"
```

### Test Authentication

```bash
cd /pixel/pixel-agent
bun test src/__tests__/twitter-plugin.test.ts
```

## Troubleshooting

### "Twitter plugin disabled" message

- Cause: `ENABLE_TWITTER_PLUGIN=false` set in environment
- Solution: Set to `true` and restart agent

### "Authentication failed (401 Unauthorized)" error

- Cause: Invalid Twitter API credentials
- Solution:
  1. Verify all four credentials in `.env` are correct
  2. Check Twitter Developer Portal for revoked tokens
  3. Regenerate credentials if needed

### "Twitter credentials not configured" warning

- Cause: One or more Twitter credentials missing
- Solution: Add all four credentials to `.env`:
  - TWITTER_API_KEY
  - TWITTER_API_SECRET_KEY
  - TWITTER_ACCESS_TOKEN
  - TWITTER_ACCESS_TOKEN_SECRET

### Rate Limiting

- Twitter has strict rate limits (24-hour quotas)
- Plugin automatically handles rate limiting
- Check logs for remaining quota information

## Notes

- The plugin uses OAuth 1.0a authentication (required by current implementation)
- Rate limiting is handled gracefully without crashing the agent
- 401 authentication errors disable Twitter plugin but keep agent running
- The `ENABLE_TWITTER_PLUGIN` toggle allows disabling without removing credentials
- Plugin is compatible with ElizaOS v1.7.0 and Twitter API v2
