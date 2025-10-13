# Timeline Lore Historical Context Feature

## Overview

This feature adds historical context awareness to timeline lore digest generation, preventing repetitive insights across consecutive digests by providing the LLM with knowledge of recent analyses.

## Problem Solved

**Before**: Timeline lore digests were generated without knowledge of recent analyses, causing repetitive insights like "bitcoin being discussed" to appear in multiple consecutive digests.

**After**: Each digest generation now includes summaries of recent digests in the LLM prompt, enabling it to identify what's truly new vs already covered.

## Implementation

### Files Modified

1. **`plugin-nostr/lib/narrativeMemory.js`**
   - Added `getRecentDigestSummaries(lookback = 3)` method
   - Returns compact summaries of recent timeline lore digests
   - Only includes essential fields: timestamp, headline, tags, priority

2. **`plugin-nostr/lib/service.js`**
   - Modified `_generateTimelineLoreSummary()` method
   - Fetches recent digest summaries before generating new digest
   - Includes context section in LLM prompt
   - Updated prompt to instruct LLM to focus on NEW developments

### How It Works

```javascript
// 1. Fetch recent digest context
const recentContext = this.narrativeMemory?.getRecentDigestSummaries?.(3) || [];

// 2. Build context section for prompt
const contextSection = recentContext.length ? 
  `\nRECENT COVERAGE (avoid repeating these topics):\n${recentContext.map(c => 
    `- ${c.headline} (${c.tags.join(', ')})`).join('\n')}\n` : '';

// 3. Include in LLM prompt
const prompt = `${contextSection}Analyze these NEW posts. Focus on developments NOT covered in recent summaries above.`;
```

### Example Flow

#### Batch 1 (No context)
```
Posts: "Bitcoin price hits $52k", "BTC breaking resistance"
Context: None (first batch)
Generated: "Bitcoin being discussed"
```

#### Batch 2 (With context)
```
Posts: "Bitcoin price still hot topic", "More BTC discussion"
Context: 
  - Bitcoin being discussed (bitcoin, discussion)
Generated: "Community sentiment analysis on price action" (NEW ANGLE!)
```

#### Batch 3 (Even more context)
```
Posts: "Bitcoin trending on social media", "BTC discussions everywhere"
Context:
  - Bitcoin being discussed (bitcoin, discussion)
  - Community sentiment analysis... (bitcoin, sentiment, analysis)
Generated: "Social engagement metrics show viral spread" (ANOTHER NEW ANGLE!)
```

## Configuration

The feature uses these defaults:

- **Lookback count**: 3 recent digests
- **Context inclusion**: Automatic when narrativeMemory is available
- **Graceful fallback**: Works without narrativeMemory (no context section)

To adjust the lookback count, modify the call in `service.js`:

```javascript
const recentContext = this.narrativeMemory?.getRecentDigestSummaries?.(5) || []; // Use 5 instead of 3
```

## Testing

### Unit Tests

Run the unit test suite:
```bash
cd plugin-nostr
node test-timeline-lore-context.js
```

Tests cover:
- Empty timeline lore
- Adding and retrieving digests
- Lookback limits
- Compact summary structure
- Invalid input handling

### Integration Tests

Run the integration test:
```bash
cd plugin-nostr
node test-timeline-lore-integration.js
```

Demonstrates:
- Full flow across multiple batches
- Context accumulation
- Novelty detection
- Topic evolution

## Benefits

1. **Reduced Repetition**: Same topics won't generate identical insights
2. **Better Novelty Detection**: LLM identifies what's truly new
3. **Improved Digest Quality**: Each digest adds unique value
4. **Context Awareness**: Agent "remembers" what it recently analyzed
5. **Natural Evolution**: Topics evolve across digests instead of repeating

## Monitoring

To observe the feature in action:

1. Watch digest headlines in logs for diversity
2. Compare consecutive digests on similar topics
3. Monitor for reduced tag/topic overlap
4. Check that insights show progression, not repetition

Expected log patterns:
```
[NOSTR] Timeline lore captured (25 posts • Bitcoin price action analysis)
[NOSTR] Timeline lore captured (30 posts • Lightning adoption metrics)
[NOSTR] Timeline lore captured (28 posts • Developer sentiment on protocol upgrades)
```

Instead of:
```
[NOSTR] Timeline lore captured (25 posts • Bitcoin being discussed)
[NOSTR] Timeline lore captured (30 posts • Bitcoin being discussed)
[NOSTR] Timeline lore captured (28 posts • Bitcoin being discussed)
```

## Troubleshooting

### Issue: Still seeing repetitive digests

**Possible causes:**
- Lookback count too low (increase from 3 to 5)
- Context section not reaching LLM (check prompt logs)
- Posts are genuinely about new developments (expected behavior)

**Solutions:**
1. Increase lookback: `getRecentDigestSummaries(5)`
2. Verify narrativeMemory is initialized
3. Check LLM prompt includes context section

### Issue: Missing important topics

**Possible causes:**
- Lookback count too high (LLM skipping too much)
- Over-aggressive filtering by LLM

**Solutions:**
1. Reduce lookback: `getRecentDigestSummaries(2)`
2. Adjust prompt to clarify "new angle on existing topic is valuable"

## Future Enhancements

Potential improvements:
- **Smart lookback**: Adjust count based on topic velocity
- **Semantic similarity**: Use embeddings to detect truly novel content
- **Time-based decay**: Older context has less weight
- **Topic-specific tracking**: Per-topic history instead of global
- **Confidence scores**: LLM reports how novel the digest is

## API Reference

### `getRecentDigestSummaries(lookback)`

Returns compact summaries of recent timeline lore digests.

**Parameters:**
- `lookback` (number, default: 3): Number of recent digests to return

**Returns:**
Array of digest summaries with structure:
```javascript
{
  timestamp: 1634567890123,
  headline: "Bitcoin price reaches new highs",
  tags: ["bitcoin", "price", "trading"],
  priority: "high"
}
```

**Example:**
```javascript
const recent = narrativeMemory.getRecentDigestSummaries(3);
console.log(`Found ${recent.length} recent digests`);
recent.forEach(d => console.log(d.headline));
```

## Related Documentation

- Main narrative memory system: `lib/narrativeMemory.js`
- Timeline lore generation: `lib/service.js` (`_generateTimelineLoreSummary`)
- Context accumulator: `lib/contextAccumulator.js`
- Test utilities: `test-timeline-lore-context.js`
