# @pixel/plugin-nostr

Nostr plugin for ElizaOS with LLM-driven post and reply generation.

What changed:
- Posts and replies are now generated with the configured LLM via `runtime.useModel(ModelType.TEXT_SMALL, { prompt, ... })`.
- Falls back to `character.postExamples` only if the LLM is unavailable or errors.
- Replies are context-aware using the mention content and the character persona/styles.
- Output is sanitized to respect a strict whitelist (keeps only these if present):
  - Site: https://ln.pixel.xx.kg
  - Handle: @PixelSurvivor
  - BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za
  - LN: sparepicolo55@walletofsatoshi.com

Config (from Character.settings):
- NOSTR_PRIVATE_KEY: hex or nsec
- NOSTR_RELAYS: comma-separated list
- NOSTR_LISTEN_ENABLE: true/false
- NOSTR_POST_ENABLE: true/false
- NOSTR_POST_INTERVAL_MIN / MAX: seconds
- NOSTR_REPLY_ENABLE: true/false
- NOSTR_REPLY_THROTTLE_SEC: seconds
- NOSTR_DISCOVERY_ENABLE: true/false (default true)
- NOSTR_DISCOVERY_INTERVAL_MIN / MAX: seconds (default 900/1800)
- NOSTR_DISCOVERY_MAX_REPLIES_PER_RUN: number (default 5)
- NOSTR_DISCOVERY_MAX_FOLLOWS_PER_RUN: number (default 5)
- NOSTR_HOME_FEED_ENABLE: true/false (default true)
- NOSTR_HOME_FEED_INTERVAL_MIN / MAX: seconds (default 300/900)
- NOSTR_HOME_FEED_REACTION_CHANCE: 0.0-1.0 (default 0.15)
- NOSTR_HOME_FEED_REPOST_CHANCE: 0.0-1.0 (default 0.05)
- NOSTR_HOME_FEED_QUOTE_CHANCE: 0.0-1.0 (default 0.02)
- NOSTR_HOME_FEED_MAX_INTERACTIONS: number (default 3)
- NOSTR_UNFOLLOW_ENABLE: true/false (default true)
- NOSTR_UNFOLLOW_MIN_QUALITY_SCORE: 0.0-1.0 (default 0.3)
- NOSTR_UNFOLLOW_MIN_POSTS_THRESHOLD: number (default 5)
- NOSTR_UNFOLLOW_CHECK_INTERVAL_HOURS: number (default 24)

## Home Feed Interactions

The plugin now includes home feed monitoring and automated interactions with posts from followed users:

**Features:**
- **Real-time subscription**: Monitors posts from all followed users in real-time
- **Quality filtering**: Only interacts with posts that pass quality checks (length, content, recency)
- **Multiple interaction types**:
  - **Reactions** (👍): Simple likes on quality posts
  - **Reposts**: Shares posts from followed users
  - **Quote reposts**: Adds commentary when reposting
- **Configurable probabilities**: Control how often each type of interaction occurs
- **Rate limiting**: Maximum interactions per check cycle to avoid spam
- **Deduplication**: Tracks processed events to avoid duplicate interactions

**How it works:**
1. Subscribes to posts from all users in your contact list
2. Filters posts for quality (avoids spam, bots, low-quality content)
3. Randomly selects interaction type based on configured probabilities
4. Generates quote text using LLM for quote reposts
5. Publishes interactions to Nostr relays

**Configuration:**
- Set `NOSTR_HOME_FEED_REACTION_CHANCE=0.15` for 15% chance to react to posts
- Set `NOSTR_HOME_FEED_REPOST_CHANCE=0.05` for 5% chance to repost
- Set `NOSTR_HOME_FEED_QUOTE_CHANCE=0.02` for 2% chance to quote repost
- Adjust `NOSTR_HOME_FEED_MAX_INTERACTIONS=3` to limit interactions per cycle
- Control check frequency with `NOSTR_HOME_FEED_INTERVAL_MIN/MAX`

**Safety features:**
- Never interacts with own posts
- Quality filtering prevents spam interactions
- Rate limiting prevents overwhelming relays
- LLM-generated quote text respects character persona and whitelist

## Unfollow Management

The plugin includes intelligent unfollow functionality to maintain feed quality by automatically unfollowing users who consistently post low-quality content:

**Features:**
- **Quality tracking**: Monitors quality scores for all followed users based on their post content
- **Automatic unfollow**: Unfollows users who fall below quality thresholds after sufficient observation
- **Configurable thresholds**: Control when to unfollow based on quality scores and post counts
- **Periodic checks**: Runs unfollow checks at configurable intervals to avoid constant processing
- **Rate limiting**: Limits unfollows per check cycle to prevent aggressive behavior
- **Data cleanup**: Removes tracking data for unfollowed users

**How it works:**
1. Tracks quality scores for each followed user based on their posts
2. Maintains running averages of quality scores over time
3. Periodically checks for users below quality thresholds
4. Unfollows low-quality users and updates contact list
5. Cleans up tracking data for unfollowed users

**Configuration:**
- Set `NOSTR_UNFOLLOW_ENABLE=true` to enable automatic unfollowing
- Set `NOSTR_UNFOLLOW_MIN_QUALITY_SCORE=0.3` for minimum quality score (0.0-1.0)
- Set `NOSTR_UNFOLLOW_MIN_POSTS_THRESHOLD=5` for minimum posts before considering unfollow
- Set `NOSTR_UNFOLLOW_CHECK_INTERVAL_HOURS=24` for how often to check (1-168 hours)

**Quality scoring:**
- Posts are scored based on content quality (length, relevance, engagement potential)
- Running averages prevent single bad posts from triggering unfollows
- Only users with sufficient post history are considered for unfollowing
- Quality filtering uses the same criteria as home feed interactions

**Safety features:**
- Only unfollows users with enough posts to establish patterns
- Rate limits unfollows (max 5 per check cycle)
- Preserves high-quality follows
- Logs all unfollow actions for transparency
- Graceful error handling prevents service disruption

LLM requirements:
- Ensure an LLM plugin is installed and configured (e.g. `@elizaos/plugin-openrouter` or `@elizaos/plugin-openai`).
- The plugin calls `runtime.useModel(TEXT_SMALL, { prompt, maxTokens, temperature })`.
- You can influence output through your character `system`, `topics`, `style.post`/`style.chat`, and `postExamples` (few-shots only).

Notes:
- We store best-effort memories for posts and replies to help future context.
- If you prefer a different model type, set `OPENROUTER_*` or provider envs as usual; the plugin uses the runtime’s configured handler.

## Realtime LNPixels → plugin‑nostr → Nostr + Memory

This plugin now includes a realtime listener that reacts to LNPixels purchase confirmations, posts auto‑generated, on‑brand notes to Nostr, and persists all activity to ElizaOS memory for agent reasoning.

How it works:
- The LNPixels API emits Socket.IO events (`activity.append`) when purchases are confirmed.
- `lib/lnpixels-listener.js` connects to that WebSocket, validates/filters/rate‑limits events, and emits a `pixel.bought` event on the internal bridge (`lib/bridge.js`).
- `lib/service.js` listens for `pixel.bought`, builds a character‑aware prompt, generates text via the configured model with fallback, sanitizes it, and calls `postOnce(text)` to publish.
- **Memory Integration**: Posts and triggers are saved to ElizaOS memory with pixel coordinates, sats, colors, and metadata for future agent reasoning.

Configure:
- Character settings include `LNPIXELS_WS_URL` (defaults to `http://localhost:3000`).
- Ensure an LLM provider plugin is enabled and configured (OpenRouter/OpenAI/Google, etc.).
- Keep Nostr keys and relays configured as usual.

Safety and pacing:
- Dedupe events by `event_id`/`payment_hash` (fallback to `x,y,created_at`).
- Strict whitelist keeps only approved links/handles.
- Tone variety is rotated (hype/poetic/playful/solemn/stats/cta) to avoid repetition.
- Rate limiting: Maximum 3 posts per 10 seconds to prevent spam.
- Memory persistence: All generated posts saved to `lnpixels:canvas` room with structured data.

Memory integration:
- **Room organization**: All LNPixels posts stored in `lnpixels:canvas` room
- **Structured data**: Pixel coordinates, sats, colors, trace IDs preserved  
- **Agent queries**: Search by time, location, content, value for contextual responses
- **Context building**: Automatic generation of canvas activity summaries

Example memory structure:
```javascript
{
  id: "lnpixels:post:event_id:trace_id",
  roomId: "lnpixels:canvas",
  content: {
    type: "lnpixels_post",
    text: "Posted to Nostr: \"🎨 Generated message...\"",
    data: {
      generatedText: "🎨 Generated message...",
      triggerEvent: { x, y, color, sats, letter },
      traceId: "abc123",
      platform: "nostr"
    }
  }
}
```

Files:
- `lib/bridge.js` — EventEmitter bridge for external posts with validation
- `lib/lnpixels-listener.js` — WebSocket listener that delegates to plugin‑nostr via `pixel.bought`
- `lib/service.js` — NostrService (starts listener and handles bridge events including `external.post` and `pixel.bought`)

Testing:
- `test-basic.js` — Bridge validation, rate limiting, input validation
- `test-integration.js` — End-to-end flow simulation
- `test-listener.js` — Component testing with mocked dependencies
- `test-memory.js` — Memory creation and persistence validation
- `test-eliza-integration.js` — ElizaOS memory compatibility and query patterns

Status: ✅ Production ready with comprehensive testing and memory integration

### Pixel purchase delegation usage

If you have an external producer for pixel events, you can trigger a post via:

```js
const { emitter } = require('./lib/bridge');
emitter.emit('pixel.bought', { activity: { x: 10, y: 20, sats: 42, letter: 'A', color: '#fff' } });
```

The service handles text generation and posting. See `test/service.pixelBought.test.js`.

Notes:
- Pixel events are deduplicated within the service (5‑minute TTL) using `payment_hash` → `event_id`/`id` → `x,y,created_at` as the key.
- To disable delegation memory writes in the listener, set `LNPIXELS_CREATE_DELEGATION_MEMORY=false` (default); set to `true` to persist a small reference memory.
- Anti-spam: service posts at most one pixel note per hour by default; set `LNPIXELS_POST_MIN_INTERVAL_MS` to override. Non-posted events are still saved as `lnpixels_event` memories with throttled=true.
