# Centralized Posting Queue Implementation Summary

## Problem Statement

Pixel was responding to events in unnatural batches:
- Multiple mentions → instant batch replies
- Discovery scans → 5 rapid sequential replies  
- Home feed monitoring → simultaneous reactions
- Scheduled posts conflicting with pixel purchases

This created bot-like activity patterns that looked artificial.

## Solution

Implemented a **centralized posting queue** (`postingQueue.js`) that:
1. Queues all outgoing Nostr events (posts, replies, reactions, reposts)
2. Prioritizes based on importance (CRITICAL > HIGH > MEDIUM > LOW)
3. Enforces natural delays between posts (15s-2min, configurable)
4. Processes sequentially (never in parallel)
5. Prevents duplicate posts via ID-based deduplication

## Files Changed

### New Files
1. **`plugin-nostr/lib/postingQueue.js`** (New)
   - PostingQueue class with priority management
   - Rate limiting logic
   - Queue processing and monitoring
   - Deduplication

2. **`plugin-nostr/POSTING_QUEUE.md`** (New)
   - Comprehensive documentation
   - Architecture diagrams
   - Configuration guide
   - Troubleshooting tips

### Modified Files
1. **`plugin-nostr/lib/service.js`**
   - Added PostingQueue initialization in constructor
   - Updated `handleMention()` to queue mention replies (HIGH priority)
   - Updated `handleMention()` throttled replies to queue (HIGH priority)
   - Updated `_processDiscoveryReplies()` to queue discovery replies (MEDIUM priority)
   - Updated `postOnce()` to queue scheduled/external posts (LOW/CRITICAL priority)
   - Updated `_handleHomeFeedEvent()` to queue reactions/reposts (MEDIUM priority)

2. **`plugin-nostr/README.md`**
   - Added "Key Features" section highlighting the posting queue
   - Added configuration examples

## Priority Levels

```
CRITICAL (0)  →  Pixel purchases, external posts
HIGH (1)      →  Direct mentions, user replies
MEDIUM (2)    →  Discovery replies, home feed interactions
LOW (3)       →  Scheduled posts
```

## Configuration Added

Three new environment variables:

```bash
NOSTR_MIN_DELAY_BETWEEN_POSTS_MS=15000      # Default: 15 seconds
NOSTR_MAX_DELAY_BETWEEN_POSTS_MS=120000     # Default: 2 minutes
NOSTR_MENTION_PRIORITY_BOOST_MS=5000        # Default: 5 seconds faster
```

## Example Timeline

**Before (Unnatural Batching):**
```
T+0s:   5 mentions arrive
T+1s:   Reply 1 posted
T+1s:   Reply 2 posted  
T+1s:   Reply 3 posted
T+1s:   Reply 4 posted
T+1s:   Reply 5 posted
        ↑ Looks like a bot!
```

**After (Natural Spacing):**
```
T+0s:   5 mentions arrive, queued by priority
T+10s:  Reply 1 posted (HIGH priority)
T+25s:  Reply 2 posted
T+48s:  Reply 3 posted
T+65s:  Reply 4 posted
T+92s:  Reply 5 posted
        ↑ Looks natural and thoughtful
```

## Benefits

### 1. Natural Appearance
- Posts spaced like a human would
- No sudden activity bursts
- Reduced bot detection risk

### 2. Priority Management
- Important mentions answered first
- Background activities don't block urgent responses
- Scheduled posts yield to real interactions

### 3. Collision Prevention
- Pixel posts don't conflict with scheduled posts
- Discovery doesn't interfere with mentions
- All activities coordinated

### 4. Resource Efficiency
- Prevents relay rate limiting
- Reduces connection stress
- Better memory management (queue size: 50 max)

### 5. Better Engagement
- Spaced replies don't overwhelm timelines
- Users see thoughtful responses
- Higher quality perception

## Testing

The queue can be monitored via logs:

```bash
# Watch queue activity
tail -f elizaos.log | grep QUEUE

# Example log output:
[QUEUE] Enqueued mention post (id: a1b2c3d4, priority: 1, queue: 2)
[QUEUE] Waiting 18s before posting (natural spacing)
[QUEUE] Processing mention post (id: a1b2c3d4, waited: 18s)
[QUEUE] Successfully posted mention (total processed: 23)
```

## Queue Status API

Get queue health programmatically:

```javascript
const status = this.postingQueue.getStatus();
// Returns:
// {
//   queueLength: 3,
//   isProcessing: true,
//   stats: { processed: 15, queued: 18, dropped: 0 },
//   nextPost: { type: 'discovery', priority: 2, waitTime: 45 }
// }
```

## Safety Features

1. **Size limits**: Max 50 queued posts
2. **Overflow handling**: Drops lowest priority when full
3. **Deduplication**: Rejects duplicate IDs
4. **Error recovery**: Failed posts don't block queue
5. **Stats tracking**: Monitor processed/dropped counts

## Backwards Compatibility

The changes are **fully backwards compatible**:
- All existing configuration still works
- No breaking API changes
- Queue is transparent to external callers
- Graceful degradation if queue fails

## Performance Impact

- **Minimal overhead**: Queue operations are O(n log n) for sorting
- **Memory efficient**: Fixed max size (50 items)
- **No blocking**: Async processing
- **Self-cleaning**: Processed items removed immediately

## Future Enhancements

Potential improvements for later:

1. **Time-of-day awareness**: Vary delays based on time
2. **Adaptive delays**: Learn optimal timing from engagement
3. **Priority learning**: Adjust priorities based on success
4. **Queue persistence**: Save queue across restarts
5. **Multi-agent coordination**: Share queue state

## Migration Path

Existing code works without changes. New code should use the queue:

```javascript
// Old way (still works, but immediate):
const ok = await this.postReply(evt, text);

// New way (queued, natural timing):
await this.postingQueue.enqueue({
  type: 'mention',
  id: `mention:${evt.id}`,
  priority: this.postingQueue.priorities.HIGH,
  action: async () => await this.postReply(evt, text)
});
```

## Deployment Notes

1. **No restart required**: Changes apply on next agent start
2. **No database changes**: All in-memory queue
3. **No relay changes**: Still uses same publish methods
4. **Config optional**: Works with defaults

## Success Metrics

Track these to measure effectiveness:

- ✅ **Reduced batch replies**: No more instant reply bursts
- ✅ **Natural spacing**: 15s-2min between posts
- ✅ **Priority respected**: Mentions answered before discovery
- ✅ **No collisions**: Scheduled posts don't race pixels
- ✅ **Queue health**: Monitor processed/dropped ratio

## Summary

The centralized posting queue transforms Pixel from a reactive bot into a thoughtful agent. By introducing natural delays and intelligent prioritization, all activities appear organic while maintaining responsiveness where it matters most. This single architectural change dramatically improves the perception of Pixel's behavior without sacrificing functionality.

---

**Implementation Date**: 2025-01-07  
**Files Changed**: 4 (2 new, 2 modified)  
**Lines Added**: ~350  
**Breaking Changes**: None  
**Config Changes**: 3 new optional env vars
