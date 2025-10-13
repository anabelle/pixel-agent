# Storyline Advancement Detection - Implementation Documentation

## Overview

This implementation integrates continuity analysis into the candidate selection pipeline to boost posts that advance existing storylines and filter out posts that rehash concluded topics.

## Changes Made

### 1. NarrativeMemory.js - New `checkStorylineAdvancement()` Method

**Location:** `plugin-nostr/lib/narrativeMemory.js` (lines 959-1011)

**Purpose:** Detects if content advances existing storylines by analyzing:
- Recurring themes across recent timeline lore digests
- Watchlist items from previous digests
- Emerging threads in the latest digest

**Implementation Details:**
```javascript
checkStorylineAdvancement(content, topics) {
  // Inline synchronous continuity check
  const lookbackCount = 5;
  const recent = this.timelineLore.slice(-lookbackCount);
  if (recent.length < 2) return null;
  
  // Calculate recurring themes
  // Check watchlist items
  // Identify emerging threads
  
  return {
    advancesRecurringTheme: boolean,
    watchlistMatches: string[],
    isEmergingThread: boolean
  };
}
```

**Key Features:**
- Synchronous execution (required for scoring pipeline)
- Requires at least 2 timeline lore digests for analysis
- Case-insensitive matching
- Handles empty topics array gracefully

### 2. Service.js - Enhanced `_evaluateTimelineLoreCandidate()` Method

**Location:** `plugin-nostr/lib/service.js` (lines 6155-6187)

**Purpose:** Integrates storyline advancement detection into candidate scoring

**Score Bonuses:**
- **+0.3** for advancing recurring themes
- **+0.5** for matching watchlist items
- **+0.4** for relating to emerging threads

**Implementation:**
```javascript
// Phase 5: Check storyline advancement
let storylineAdvancement = null;
try {
  if (this.narrativeMemory?.checkStorylineAdvancement) {
    storylineAdvancement = this.narrativeMemory.checkStorylineAdvancement(
      normalizedContent, topics
    );
    if (storylineAdvancement) {
      if (storylineAdvancement.advancesRecurringTheme) {
        score += 0.3;
      }
      if (storylineAdvancement.watchlistMatches.length) {
        score += 0.5;
      }
      if (storylineAdvancement.isEmergingThread) {
        score += 0.4;
      }
    }
  }
} catch (err) {
  logger.debug('[NOSTR] Storyline advancement check failed:', err?.message);
}
```

**Signals Added:**
- `'advances recurring storyline'` - when post advances recurring themes
- `'continuity: <items>'` - when post matches watchlist items
- `'emerging thread'` - when post relates to emerging threads

**Metadata Enhancement:**
The `storylineAdvancement` object is now included in the candidate's return value, making it available for batch preparation and logging.

### 3. Service.js - Enhanced `_prepareTimelineLoreBatch()` Method

**Location:** `plugin-nostr/lib/service.js` (lines 6379-6438)

**Purpose:** Prioritizes candidates with storyline advancement during batch preparation

**Implementation:**
```javascript
_prepareTimelineLoreBatch(limit = this.timelineLoreBatchSize) {
  // ... deduplication logic ...
  
  // Enhanced sorting: prioritize storyline advancement while maintaining temporal order
  items.sort((a, b) => {
    // Calculate storyline priority boost
    const aStorylineBoost = this._getStorylineBoost(a);
    const bStorylineBoost = this._getStorylineBoost(b);
    
    // If one item has significantly better storyline advancement, prioritize it
    const storylineDiff = bStorylineBoost - aStorylineBoost;
    if (Math.abs(storylineDiff) >= 0.5) {
      return storylineDiff; // Sort by storyline boost (descending)
    }
    
    // Otherwise maintain temporal order
    return aTs - bTs;
  });
  
  return items.slice(-maxItems);
}
```

### 4. Service.js - New `_getStorylineBoost()` Helper Method

**Location:** `plugin-nostr/lib/service.js` (lines 6407-6429)

**Purpose:** Calculates storyline advancement boost from candidate metadata

**Boost Values:**
- **+0.3** for 'advances recurring storyline' signal
- **+0.5** for 'continuity:' signal
- **+0.4** for 'emerging thread' signal

## Test Coverage

### Unit Tests

**File:** `plugin-nostr/test/storyline-advancement.test.js`

Tests for `checkStorylineAdvancement()`:
- ✅ Returns null when no continuity data exists
- ✅ Returns null when insufficient timeline lore exists
- ✅ Detects content that advances recurring themes
- ✅ Detects content matching watchlist items
- ✅ Detects content relating to emerging threads
- ✅ Handles content with multiple storyline signals
- ✅ Handles content with no storyline signals
- ✅ Case-insensitive theme matching
- ✅ Handles empty topics array gracefully
- ✅ Integration with analyzeLoreContinuity

### Integration Tests

**File:** `plugin-nostr/test/service.storylineAdvancement.test.js`

Tests for service integration:
- ✅ Adds score bonus for recurring theme advancement
- ✅ Adds score bonus for watchlist matches
- ✅ Adds score bonus for emerging thread
- ✅ Combines multiple storyline advancement bonuses
- ✅ Handles cases where narrativeMemory is not available
- ✅ Calculates correct boost for batch prioritization
- ✅ Returns 0 boost for items without storyline signals
- ✅ Handles items without metadata gracefully

### End-to-End Test

**File:** `plugin-nostr/test-storyline-advancement-integration.js`

Demonstrates complete workflow:
1. Building recurring storyline across 3 digests
2. Analyzing storyline continuity
3. Testing new posts for storyline advancement
4. Batch prioritization with storyline advancement

**Run with:** `node plugin-nostr/test-storyline-advancement-integration.js`

## Example Scenarios

### Scenario 1: Recurring Theme Advancement

**Storyline:**
- Digest 1: "Lightning Network protocol improvements" (tags: lightning, protocol)
- Digest 2: "Lightning adoption metrics surge" (tags: lightning, adoption)
- Digest 3: "Lightning testing phase begins" (tags: lightning, testing)

**New Post:** "Lightning routing efficiency improved by 40%"

**Result:**
- ✅ Advances recurring theme "lightning" (+0.3 score)
- ✅ Matches watchlist "routing efficiency" (+0.5 score)
- **Total Bonus: +0.8**

### Scenario 2: Watchlist Item Follow-up

**Storyline:**
- Digest 1: Watchlist includes "upgrade timeline"
- Digest 2: Watchlist includes "testing phase"

**New Post:** "Major update on upgrade timeline - testing phase starts next week"

**Result:**
- ✅ Matches watchlist "upgrade timeline" (+0.5 score)
- ✅ Matches watchlist "testing phase" (+0.5 score)
- **Total Bonus: +0.5** (watchlist bonus is applied once regardless of matches)

### Scenario 3: Emerging Thread

**Storyline:**
- Digest 1: Tags: bitcoin, ethereum
- Digest 2: Tags: bitcoin, **ai** (new), innovation

**New Post:** "Exploring AI applications in bitcoin development"

**Result:**
- ✅ Relates to emerging thread "ai" (+0.4 score)
- **Total Bonus: +0.4**

### Scenario 4: Multiple Signals

**New Post:** "Major relay improvements boost zap adoption metrics"

**Result:**
- ✅ Advances recurring theme "nostr" (+0.3 score)
- ✅ Matches watchlist "relay improvements" (+0.5 score)
- ✅ Relates to emerging thread "zaps" (+0.4 score)
- **Total Bonus: +1.2**

## Acceptance Criteria Status

✅ Posts that advance recurring themes get score bonuses (+0.3)
✅ Posts matching watchlist items are prioritized (+0.5)
✅ Batch preparation prioritizes storyline advancement
✅ Continuity analysis influences candidate selection, not just prompt generation
✅ Test coverage for all storyline advancement scenarios

## Benefits

1. **Better Content Curation**: Posts that advance ongoing narratives are prioritized
2. **Watchlist Follow-through**: Predicted topics get proper attention
3. **Emerging Trend Detection**: New threads are recognized and boosted
4. **Reduced Repetition**: Stagnant topics are naturally deprioritized through lack of advancement signals
5. **Temporal Awareness**: The system now understands narrative progression over time

## Performance Considerations

- **Synchronous Execution**: `checkStorylineAdvancement()` runs inline during candidate evaluation
- **Lookback Window**: Limited to 5 most recent digests for efficiency
- **Minimal Overhead**: Simple array operations and string matching
- **Graceful Degradation**: System works normally if narrativeMemory is unavailable

## Future Enhancements

1. **Configurable Score Weights**: Allow tuning of +0.3, +0.5, +0.4 bonuses via settings
2. **Storyline Decay**: Reduce bonus for themes that have been recurring too long
3. **Storyline Conflict Detection**: Identify posts that contradict established narratives
4. **Multi-level Storylines**: Track storylines at different timeframes (hourly, daily, weekly)

## Migration Notes

- No breaking changes to existing APIs
- Backward compatible - works without narrative memory available
- Existing tests continue to pass
- New functionality is opt-in through narrative memory integration

## Dependencies

- Requires `narrativeMemory` instance to be available on service
- Depends on timeline lore digests being stored
- Uses existing `analyzeLoreContinuity()` logic inline for performance

## Logging

New debug logs added:
```
[STORYLINE-ADVANCE] ${evt.id} advances recurring theme (+0.3)
[STORYLINE-ADVANCE] ${evt.id} matches watchlist items: ${items} (+0.5)
[STORYLINE-ADVANCE] ${evt.id} relates to emerging thread (+0.4)
```

## Summary

This implementation successfully integrates continuity analysis into the candidate selection pipeline, ensuring that posts advancing existing storylines are prioritized before batch generation rather than only influencing prompts after generation. The feature is well-tested, performant, and provides significant improvements to narrative-aware content curation.
