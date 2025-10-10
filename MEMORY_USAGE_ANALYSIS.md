# Memory Usage Analysis - Emerging Story Integration

**Date:** October 9, 2025  
**Task:** Analyze memories collected but not used, integrate underutilized memory types

## Executive Summary

Successfully identified and integrated previously underutilized `emerging_story` memory type into the agent's prompt generation context. All tests pass after integration.

## Memory Types Inventory

### Fully Utilized Memory Types
These memory types are persisted AND consumed in prompt generation:

| Type | Created By | Consumed By | Purpose |
|------|-----------|-------------|---------|
| `hourly_digest` | ContextAccumulator | Service (all prompt paths) | Summarizes hourly activity metrics |
| `daily_report` | ContextAccumulator | Service (all prompt paths) | Daily activity summary |
| `narrative_hourly` | NarrativeMemory | Service (all prompt paths) | Long-term hourly narrative |
| `narrative_daily` | NarrativeMemory | Service (all prompt paths) | Long-term daily narrative |
| `narrative_weekly` | NarrativeMemory | Service (all prompt paths) | Long-term weekly narrative |
| `narrative_monthly` | NarrativeMemory | Service (all prompt paths) | Long-term monthly narrative |
| `narrative_timeline` | NarrativeMemory | Service (all prompt paths) | Priority timeline events |
| `self_reflection` | SelfReflectionEngine | Service (all prompt paths) | Agent introspection insights |
| `lnpixels_post` | LNPixels Listener | Service (all prompt paths) | Generated pixel posts |
| `lnpixels_event` | LNPixels Listener | Service (all prompt paths) | Pixel events (throttled/skipped) |
| `mention` | Service | Service (all prompt paths) | User mentions of agent |
| `social_interaction` | Context helpers | Service (all prompt paths) | Platform interactions (zaps, replies) |

### Operational Memory Types (Not for Context)
These are used for internal operations, not generation context:

| Type | Created By | Consumed By | Purpose |
|------|-----------|-------------|---------|
| `lnpixels_lock` | Service | Service (dedup check) | Cross-process posting lock |
| `interaction_counts` | Service | Service (rate limiting) | User interaction throttling |
| `user_profile` | UserProfileManager | UserProfileManager | User learning/engagement tracking |
| `daily_digest_post` | Service | Service (posting tracking) | Daily digest post history |

### Previously Underutilized (NOW INTEGRATED)

| Type | Status Before | Status After | Integration Path |
|------|---------------|--------------|------------------|
| `emerging_story` | Persisted, not consumed | **Fully integrated** | Added to permanent memory summaries in all prompt paths |

## Changes Made

### File Modified
- `plugin-nostr/lib/service.js`

### Integration Points (4 locations)
All four prompt generation paths now include `emerging_story` summaries in their debug memory dumps:

1. **Post Generation** (line ~2013)
2. **Awareness Post Generation** (line ~2320)
3. **Awareness Dry-Run** (line ~2639)
4. **Reply Generation** (line ~3162)

### Memory Structure Added
```javascript
// Emerging stories (persisted by ContextAccumulator)
if (byType.has('emerging_story')) {
  const items = pickLatest(byType.get('emerging_story'), 3).map(m => {
    const d = m.content?.data || {};
    const s = d.sentiment || {};
    return {
      createdAtIso: safeIso(m.createdAt),
      topic: d.topic || null,
      mentions: typeof d.mentions === 'number' ? d.mentions : null,
      uniqueUsers: typeof d.uniqueUsers === 'number' ? d.uniqueUsers : null,
      sentiment: {
        positive: typeof s.positive === 'number' ? s.positive : 0,
        neutral: typeof s.neutral === 'number' ? s.neutral : 0,
        negative: typeof s.negative === 'number' ? s.negative : 0,
      }
    };
  });
  if (items.length) result.emergingStories = items;
}
```

## How Emerging Stories Work

### Creation Flow
1. **ContextAccumulator** monitors events in real-time
2. When a topic reaches threshold (mentions + unique users), it's classified as "emerging"
3. Story persisted with:
   - Topic name
   - Mention count
   - Unique user count
   - Sentiment breakdown (positive/neutral/negative)
   - Recent event samples
   - First seen timestamp

### Consumption Flow (NEW)
1. **Service** loads last 200 memories
2. Groups by `content.type`
3. For `emerging_story`, picks latest 3 entries
4. Creates compact summaries with topic, metrics, sentiment
5. Includes in `permanentMemories.emergingStories` array
6. Appends to prompt via DEBUG MEMORY DUMP
7. LLM has awareness of recently detected trending topics

### Dual Context Strategy
- **Live in-memory**: `contextAccumulator.getEmergingStories()` → immediate/current
- **Persisted**: Last 3 `emerging_story` memories → historical trends
- Both now included in prompts for richer context

## Test Results

### Existing Tests: ✅ All Pass (No Regressions)

```
 Test Files  28 passed (28)
      Tests  141 passed (141)
   Duration  45.74s
```

**Key Test Coverage:**
- Event routing (17 tests)
- Connection monitoring (13 tests)  
- Interaction limits (12 tests)
- Handler integration (12 tests)
- Context accumulation (2 tests)

### Critical Limitation: ⚠️ No Tests for Prompt Generation

**The existing tests DO NOT verify:**
- ❌ Prompt content (what gets sent to the LLM)
- ❌ DEBUG MEMORY DUMP structure
- ❌ Whether `emerging_story` actually appears in prompts
- ❌ Memory formatting in permanent summaries

**What the passing tests actually prove:**
- ✅ Code doesn't crash when `emerging_story` processing is added
- ✅ `getMemories` is called correctly
- ✅ No breaking changes to existing functionality
- ✅ Service initializes and runs without errors

**What they DON'T prove:**
- The integration actually works as designed
- Prompts contain the emerging_story data
- The LLM receives the memory context

## Impact Assessment

### Benefits
1. **Richer Context**: Agent now aware of historical trending topics, not just current
2. **Better Continuity**: Can reference past emerging stories for narrative consistency
3. **Sentiment Awareness**: Historical sentiment patterns inform tone decisions
4. **No Breaking Changes**: Pure additive enhancement to existing memory summaries

### Performance
- Minimal overhead: Only loads latest 3 `emerging_story` entries
- Compact format: ~100 bytes per story summary
- Already part of existing 200-memory fetch operation

### Storage
- No new writes introduced
- Existing `emerging_story` persistence unchanged
- Now properly consumed instead of accumulating unused

## Recommendations

### Optional Enhancements
1. **First-Class Context**: If you want emerging stories more prominent than debug dump:
   ```javascript
   // In contextData object passed to prompts
   contextData.historicalEmergingStories = emergingStoryMemories;
   ```

2. **Storage Pruning**: Since `lnpixels_lock` is operational-only:
   - Could use separate table or TTL for locks
   - Filter locks from permanent memory queries
   - Current approach is fine if storage isn't constrained

3. **Profile Memory**: `user_profile` type is written but never in permanentMemories:
   - By design: managed by UserProfileManager's own cache
   - If useful for debugging, could add compact summary

### No Action Needed
- `interaction_counts`: Intentionally operational (rate limiting)
- `daily_digest_post`: Tracking only, not for generation context
- `nostr_thread_context`: Mentioned in selfReflection exclusions but never found persisted (likely ephemeral)

## Conclusion

The analysis successfully identified that `emerging_story` memories were being collected but not surfaced to the LLM context. Integration complete with:
- ✅ All prompt paths updated
- ✅ Compact, efficient memory format
- ✅ All tests passing
- ✅ Zero breaking changes
- ✅ Improved narrative continuity

The agent now has awareness of both current and historical trending topics, enabling better engagement with evolving community conversations.
