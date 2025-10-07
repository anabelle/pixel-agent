# Centralized Posting Queue

## Overview

The centralized posting queue ensures Pixel's posts, replies, and interactions appear **natural and organic** rather than appearing in unnatural batches. All outgoing Nostr events (posts, replies, reactions, reposts) are funneled through a single queue with intelligent rate limiting and priority management.

## Problem Solved

Previously, Pixel would respond to events in batches:
- Multiple mentions arriving together → instant batch replies
- Discovery finding 5 posts → 5 rapid replies
- Home feed scan → multiple simultaneous reactions
- Scheduled post + pixel purchase → collision

This created **unnatural activity patterns** that looked bot-like.

## How It Works

### Queue Architecture

```
┌─────────────────────────────────────────┐
│         PostingQueue                     │
│                                          │
│  Priority Levels:                        │
│  • CRITICAL (0) - Pixel purchases        │
│  • HIGH (1)     - Mention replies        │
│  • MEDIUM (2)   - Discovery, home feed   │
│  • LOW (3)      - Scheduled posts        │
│                                          │
│  Rate Limiting:                          │
│  • Min 15s between posts (default)       │
│  • Max 2min natural spacing              │
│  • Mentions get 5s priority boost        │
└─────────────────────────────────────────┘
         │
         ├─► Queued Posts (sorted by priority)
         ├─► Natural delays between posts
         └─► Sequential processing (no batches)
```

### Priority System

1. **CRITICAL (Priority 0)**
   - Pixel purchases from LNPixels canvas
   - External posts via bridge
   - Processed immediately with minimal delay

2. **HIGH (Priority 1)**
   - Direct mentions and replies
   - User engagement responses
   - Processed quickly (10-15s delays)

3. **MEDIUM (Priority 2)**
   - Discovery replies
   - Home feed interactions (reactions, reposts)
   - Processed with normal spacing (15s-2min)

4. **LOW (Priority 3)**
   - Scheduled posts
   - Background content
   - Processed when queue is clear

### Rate Limiting

The queue enforces natural timing:

- **Minimum delay**: 15 seconds between posts (configurable)
- **Maximum delay**: 2 minutes for natural variance (configurable)
- **Priority boost**: High-priority posts wait 5s less (configurable)
- **Queue processing**: Sequential, never parallel

Example timeline:
```
T+0s:   Mention arrives → Queued (HIGH)
T+10s:  Mention posted
T+25s:  Discovery reply queued (MEDIUM)
T+40s:  Discovery reply posted
T+85s:  Home feed reaction queued (MEDIUM)
T+100s: Home feed reaction posted
T+180s: Scheduled post queued (LOW)
T+195s: Scheduled post posted
```

## Configuration

Environment variables to customize the queue:

```bash
# Minimum delay between posts (milliseconds)
NOSTR_MIN_DELAY_BETWEEN_POSTS_MS=15000  # Default: 15 seconds

# Maximum delay between posts (milliseconds)
NOSTR_MAX_DELAY_BETWEEN_POSTS_MS=120000  # Default: 2 minutes

# Priority boost for mentions (milliseconds faster)
NOSTR_MENTION_PRIORITY_BOOST_MS=5000  # Default: 5 seconds
```

## Benefits

### 1. **Natural Appearance**
- Posts spaced out like a human would
- No sudden bursts of activity
- Reduces bot detection risk

### 2. **Better Engagement**
- Replies don't overwhelm timelines
- Users see thoughtful, spaced responses
- Higher quality perception

### 3. **Priority Management**
- Important mentions answered first
- Background activities don't block urgent responses
- Scheduled posts defer to real interactions

### 4. **Resource Efficiency**
- Prevents relay rate limiting
- Reduces connection stress
- Better memory management with queue limits

### 5. **Collision Prevention**
- Pixel posts don't conflict with scheduled posts
- Discovery doesn't interfere with mentions
- All activities coordinated centrally

## Queue Operations

### Adding Posts

All posting methods now queue instead of posting directly:

```javascript
// Mention reply (HIGH priority)
await this.postingQueue.enqueue({
  type: 'mention',
  id: `mention:${evt.id}:${Date.now()}`,
  priority: this.postingQueue.priorities.HIGH,
  action: async () => await this.postReply(evt, text)
});

// Discovery reply (MEDIUM priority)
await this.postingQueue.enqueue({
  type: 'discovery',
  id: `discovery:${evt.id}:${Date.now()}`,
  priority: this.postingQueue.priorities.MEDIUM,
  action: async () => await this.postReply(evt, text)
});

// Scheduled post (LOW priority)
await this.postingQueue.enqueue({
  type: 'scheduled',
  id: `post:${Date.now()}`,
  priority: this.postingQueue.priorities.LOW,
  action: async () => await this.postNote(text)
});
```

### Queue Status

Check queue health:

```javascript
const status = this.postingQueue.getStatus();
console.log(status);
// Output:
// {
//   queueLength: 3,
//   isProcessing: true,
//   stats: { processed: 15, queued: 18, dropped: 0 },
//   nextPost: {
//     type: 'discovery',
//     priority: 2,
//     waitTime: 45
//   }
// }
```

## Deduplication

The queue prevents duplicate posts:

- **ID-based dedup**: Each queued post has a unique ID
- **Automatic rejection**: Duplicate IDs are rejected
- **Memory efficient**: Dedupe only checks current queue (not infinite history)

## Queue Limits

Safety mechanisms prevent runaway growth:

- **Max queue size**: 50 posts
- **Overflow handling**: Drops lowest priority items when full
- **Stats tracking**: Monitor dropped posts

## Implementation Details

### Processing Flow

1. **Enqueue**: Post is added to queue with priority
2. **Sort**: Queue reorders by priority (lower number = higher priority)
3. **Wait**: Calculate delay since last post
4. **Execute**: Run the post action
5. **Delay**: Small random delay before next item
6. **Repeat**: Continue until queue empty

### Thread Safety

- Single-threaded sequential processing
- No race conditions
- No parallel posting
- Automatic recovery from errors

### Error Handling

- Failed posts don't block the queue
- Errors are logged and queue continues
- No infinite retry loops
- Graceful degradation

## Monitoring

Watch the queue in action:

```bash
# Look for queue log messages
tail -f elizaos.log | grep QUEUE

# Example output:
# [QUEUE] Enqueued mention post (id: a1b2c3d4, priority: 1, queue: 2)
# [QUEUE] Waiting 18s before posting (natural spacing)
# [QUEUE] Processing mention post (id: a1b2c3d4, waited: 18s)
# [QUEUE] Successfully posted mention (total processed: 23)
```

## Migration Notes

### Before (Direct Posting)
```javascript
const ok = await this.postReply(evt, text);
```

### After (Queued Posting)
```javascript
await this.postingQueue.enqueue({
  type: 'mention',
  id: `mention:${evt.id}`,
  priority: this.postingQueue.priorities.HIGH,
  action: async () => await this.postReply(evt, text)
});
```

## Future Enhancements

Potential improvements:

1. **Time-of-day awareness**: Post slower at night, faster during peak hours
2. **Adaptive delays**: Learn optimal timing from engagement patterns
3. **Priority learning**: Adjust priorities based on response success
4. **Queue persistence**: Save queue to memory on restart
5. **Multi-agent coordination**: Share queue across multiple agents

## Troubleshooting

### Queue Not Processing

Check if posts are stuck:
```javascript
const status = this.postingQueue.getStatus();
if (status.queueLength > 0 && !status.isProcessing) {
  // Queue stalled, investigate
}
```

### Too Slow

Decrease minimum delay:
```bash
NOSTR_MIN_DELAY_BETWEEN_POSTS_MS=10000  # 10 seconds instead of 15
```

### Too Fast

Increase minimum delay:
```bash
NOSTR_MIN_DELAY_BETWEEN_POSTS_MS=30000  # 30 seconds
```

### Mentions Delayed

Check queue priority or reduce boost delay:
```bash
NOSTR_MENTION_PRIORITY_BOOST_MS=8000  # More aggressive boost
```

## Summary

The centralized posting queue transforms Pixel from a bot that **reacts instantly in batches** to an agent that **responds thoughtfully with natural timing**. This single change dramatically improves the perception of Pixel's activity, making interactions feel more organic and human-like while maintaining responsiveness where it matters most (direct mentions and important events).
