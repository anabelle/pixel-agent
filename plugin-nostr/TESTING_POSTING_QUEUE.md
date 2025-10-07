# Testing the Centralized Posting Queue

## Quick Test

Run the basic test suite:

```bash
cd plugin-nostr
node test/postingQueue.test.js
```

Expected output:
```
=== PostingQueue Tests ===

Testing basic queue functionality...
Processing order: [ 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW' ]
✅ Priority order correct!
✅ All posts processed!

Testing deduplication...
First enqueue: success
Second enqueue (duplicate): failed
✅ Deduplication working correctly!
✅ Only one post executed!

Testing rate limiting...
Delay 1: 2012ms
Delay 2: 2008ms
✅ Rate limiting working correctly!

=== All tests completed ===
```

## Integration Testing

### 1. Monitor Queue in Live Agent

Start your agent and watch the queue logs:

```bash
# Start agent
bun run start

# In another terminal, monitor queue activity
tail -f elizaos.log | grep QUEUE
```

You should see:
```
[QUEUE] Enqueued mention post (id: a1b2c3d4, priority: 1, queue: 1)
[QUEUE] Waiting 12s before posting (natural spacing)
[QUEUE] Processing mention post (id: a1b2c3d4, waited: 12s)
[QUEUE] Successfully posted mention (total processed: 1)
```

### 2. Test Mention Response Timing

Send Pixel a mention on Nostr and observe:

1. **Immediate queuing**: Post queued within 1-2 seconds
2. **Natural delay**: Reply appears 10-30 seconds later (depending on queue)
3. **No batching**: Even if you send multiple mentions, they'll be spaced out

### 3. Test Priority System

Create a scenario with multiple post types:

1. Send a mention (HIGH priority)
2. Trigger discovery (MEDIUM priority)
3. Wait for scheduled post (LOW priority)

The mention should be answered first, even if discovery found posts earlier.

### 4. Test Discovery Spacing

Enable discovery and watch:

```bash
tail -f elizaos.log | grep "Discovery reply"
```

You should see discovery replies spaced 15-120 seconds apart, not instant batches.

### 5. Test Home Feed Natural Spacing

Enable home feed monitoring:

```bash
tail -f elizaos.log | grep "home feed"
```

Reactions and reposts should appear naturally spaced, not all at once.

## Monitoring Queue Health

### Check Queue Status

Add this to your agent code temporarily:

```javascript
// In service.js after queue initialization
setInterval(() => {
  const status = this.postingQueue.getStatus();
  if (status.queueLength > 10) {
    logger.warn(`[QUEUE] Large queue: ${status.queueLength} items`);
  }
  logger.debug(`[QUEUE] Status: ${JSON.stringify(status)}`);
}, 60000); // Check every minute
```

### Look for Warning Signs

**Good:**
```
[QUEUE] Status: {"queueLength":2,"isProcessing":true,"stats":{"processed":45,"queued":47,"dropped":0}}
```

**Needs attention:**
```
[QUEUE] Large queue: 23 items
[QUEUE] Status: {"queueLength":23,"isProcessing":true,"stats":{"processed":45,"queued":68,"dropped":5}}
```

If `dropped > 0`, the queue is hitting the 50-item limit. Consider:
- Increasing `minDelayBetweenPosts` (slower posting)
- Decreasing discovery/home feed frequency
- Reviewing what's generating so many posts

## Manual Testing Scenarios

### Scenario 1: Mention Flood
1. Have 5 people mention Pixel at once
2. Observe replies are spaced 15-30s apart
3. Check all get replied to eventually

### Scenario 2: Discovery Batch
1. Enable discovery
2. Wait for discovery run
3. Check replies are spaced naturally, not instant

### Scenario 3: Mixed Activity
1. Send a mention
2. Trigger a pixel purchase
3. Wait for scheduled post
4. Check:
   - Pixel purchase posts immediately (CRITICAL)
   - Mention replied to next (HIGH)
   - Scheduled post waits (LOW)

### Scenario 4: Long-Running Queue
1. Generate lots of activity (mentions, discovery, home feed)
2. Watch queue process over 10-15 minutes
3. Verify:
   - No posts dropped (unless queue hits 50)
   - Natural spacing maintained
   - Priority ordering preserved

## Performance Testing

### Measure Processing Rate

```javascript
// Track processing rate
const startTime = Date.now();
const startProcessed = this.postingQueue.getStatus().stats.processed;

setTimeout(() => {
  const endTime = Date.now();
  const endProcessed = this.postingQueue.getStatus().stats.processed;
  const elapsed = (endTime - startTime) / 1000;
  const rate = (endProcessed - startProcessed) / elapsed;
  logger.info(`[QUEUE] Processing rate: ${rate.toFixed(2)} posts/second`);
}, 300000); // After 5 minutes
```

Expected rate: 0.008-0.066 posts/second (1 post every 15-120 seconds)

### Memory Usage

```javascript
// Check queue memory usage
const status = this.postingQueue.getStatus();
const memoryEstimate = status.queueLength * 1024; // ~1KB per queued post
logger.info(`[QUEUE] Estimated memory: ${(memoryEstimate / 1024).toFixed(2)} KB`);
```

Should stay under 50KB (50 posts × 1KB).

## Configuration Testing

### Test Minimum Delay

Set very short delay:
```bash
NOSTR_MIN_DELAY_BETWEEN_POSTS_MS=5000  # 5 seconds
```

Observe posts every 5-10 seconds.

### Test Maximum Delay

Set longer delays:
```bash
NOSTR_MAX_DELAY_BETWEEN_POSTS_MS=300000  # 5 minutes
```

Observe posts spaced up to 5 minutes apart.

### Test Priority Boost

Set aggressive boost:
```bash
NOSTR_MENTION_PRIORITY_BOOST_MS=10000  # 10 seconds faster
```

Mentions should appear much faster than other activities.

## Troubleshooting Tests

### Queue Not Processing

```javascript
const status = this.postingQueue.getStatus();
if (status.queueLength > 0 && !status.isProcessing) {
  logger.error('[QUEUE] Queue stalled!');
  // Restart queue processing
  this.postingQueue._processQueue();
}
```

### Posts Too Slow

```javascript
const avgWait = status.queueLength * 60000; // Estimate (1 min avg per post)
if (avgWait > 600000) { // 10 minutes
  logger.warn(`[QUEUE] Long wait time: ${Math.round(avgWait / 60000)} minutes`);
}
```

### High Drop Rate

```javascript
const dropRate = status.stats.dropped / status.stats.queued;
if (dropRate > 0.1) { // More than 10% dropped
  logger.error(`[QUEUE] High drop rate: ${(dropRate * 100).toFixed(1)}%`);
}
```

## Success Criteria

✅ **Priority Order**: High priority posts processed before low priority  
✅ **Rate Limiting**: Posts spaced 15s-2min apart  
✅ **No Batching**: Multiple mentions don't all post at once  
✅ **Deduplication**: Same post can't be queued twice  
✅ **No Drops**: Drop rate < 5% under normal load  
✅ **Queue Health**: Queue length stays under 20 normally  
✅ **Memory Efficient**: Memory usage < 50KB  
✅ **Processing Rate**: 0.008-0.066 posts/second  

## Live Testing Checklist

Before deploying:

- [ ] Run unit tests: `node test/postingQueue.test.js`
- [ ] Monitor queue logs for 1 hour
- [ ] Send 10 test mentions, verify spacing
- [ ] Trigger discovery, verify no batching
- [ ] Check queue status every 5 minutes
- [ ] Verify no dropped posts under normal load
- [ ] Test with high activity (50+ queued posts)
- [ ] Verify priority ordering in real scenarios
- [ ] Check memory usage stays reasonable
- [ ] Monitor for 24 hours, check for issues

## Rollback Plan

If issues arise:

1. **Disable queuing temporarily**: Set very low delays (1ms) to effectively bypass
2. **Increase delays**: If too fast, increase `minDelayBetweenPosts`
3. **Reduce activity**: Lower discovery frequency, home feed checks
4. **Direct posting**: Temporarily patch critical paths to post directly
5. **Full rollback**: Revert to previous version of service.js

---

**Remember**: The goal is natural, human-like timing. If it feels like a bot, adjust the delays!
