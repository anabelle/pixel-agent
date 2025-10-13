# Adaptive Trending Topic Algorithm

## Overview

The Adaptive Trending system replaces simple frequency-based trending with a sophisticated algorithm that considers **velocity**, **novelty**, and **development** rather than raw mention counts. This prevents fundamental community topics (like "bitcoin", "nostr") from always dominating trending, while ensuring genuinely developing topics get appropriate visibility.

## Problem Statement

The previous trending system used simple frequency counting, which caused:
- Core community topics to always appear "trending" regardless of new information
- Genuine spikes and developments to be obscured by routine discussion
- Emerging topics to struggle for visibility against established ones
- No distinction between baseline activity and actual trending events

## Solution: Adaptive Trending Algorithm

### Key Components

#### 1. **Velocity Tracking**
Measures the rate of change in discussion activity:
- Compares recent activity (last 30 minutes) vs previous period
- Tracks both mention counts and unique user participation
- High velocity = rapid increase in engagement

#### 2. **Novelty Detection**
Identifies new angles and contexts:
- Extracts keywords from content
- Compares recent keywords with historical baseline
- High novelty = new keywords and concepts appearing

#### 3. **Baseline Activity**
Establishes historical norms to prevent "always trending":
- Calculates average mentions/users over 24-hour window
- Topics must exceed baseline to trend
- Prevents routine discussions from dominating

#### 4. **Development Tracking**
Measures sustained conversation evolution:
- Tracks participant diversity
- Monitors context evolution
- Rewards sustained, evolving discussions

### Trending Score Calculation

```
Trending Score = (Velocity × 0.4) + (Novelty × 0.3) + (Development × 0.2) + (BaselineRatio × 0.1)
```

A topic trends when its score exceeds **1.2** (configurable threshold).

## Usage

### Basic Usage

```javascript
const { AdaptiveTrending } = require('./lib/adaptiveTrending');

const trending = new AdaptiveTrending(logger, {
  baselineWindowHours: 24,      // Window for baseline calculation
  velocityWindowMinutes: 30,     // Window for velocity detection
  noveltyWindowHours: 6,         // Window for novelty comparison
  trendingThreshold: 1.2         // Minimum score to trend
});

// Record topic activity
trending.recordActivity('bitcoin', {
  mentions: 15,
  users: new Set(['user1', 'user2', 'user3']),
  keywords: ['price', 'spike', 'ATH'],
  context: 'Bitcoin breaking all-time high!'
}, Date.now());

// Get trending topics
const trendingTopics = trending.getTrendingTopics(5);
// Returns: [{ topic, score, velocity, novelty, development }, ...]
```

### Integration with ContextAccumulator

The adaptive trending system is integrated into `ContextAccumulator`:

```javascript
const { ContextAccumulator } = require('./lib/contextAccumulator');

const accumulator = new ContextAccumulator(runtime, logger, {
  adaptiveTrendingEnabled: true  // Enable adaptive trending (default: true)
});

// Get current activity with adaptive trending
const activity = accumulator.getCurrentActivity();
// activity.topics includes adaptive scores: { topic, count, score, velocity, novelty }

// Get trending topics directly
const trending = accumulator.getAdaptiveTrendingTopics({ limit: 5 });
```

### Integration with NostrService

The service automatically uses adaptive trending when available:

```javascript
// In _scoreEventForEngagement()
// Automatically checks for adaptive trending and uses scores
// to boost engagement for highly trending topics

// In topic evolution analysis
// Provides trending hints to improve topic evolution detection
```

## Configuration

### Environment Variables

```bash
# Disable adaptive trending (falls back to frequency-based)
ADAPTIVE_TRENDING_ENABLED=false  # Default: true
```

### Constructor Options

```javascript
{
  baselineWindowHours: 24,       // Hours for baseline calculation
  velocityWindowMinutes: 30,     // Window for velocity detection
  noveltyWindowHours: 6,         // Window for novelty comparison
  trendingThreshold: 1.2,        // Minimum score to trend
  maxHistoryPerTopic: 100        // Max history entries to keep
}
```

## Example Scenarios

### Scenario 1: Consistent Baseline (Does NOT Trend)

```javascript
// Bitcoin discussed consistently at baseline level
for (let i = 0; i < 24; i++) {
  trending.recordActivity('bitcoin', {
    mentions: 5,
    users: new Set(['user1', 'user2']),
    keywords: ['price', 'market'],
    context: 'Regular discussion'
  }, now - (i * 3600000));
}

// Result: Bitcoin does NOT trend (baseline activity)
```

### Scenario 2: Spike Above Baseline (TRENDS)

```javascript
// Establish baseline
// ... (baseline activity as above) ...

// Then spike with new developments
for (let i = 0; i < 10; i++) {
  trending.recordActivity('bitcoin', {
    mentions: 20,
    users: new Set(['user1', 'user2', 'user3', 'user4', 'user5']),
    keywords: ['ATH', 'breakout', 'rally', 'moon'],
    context: 'Bitcoin breaking all-time high!'
  }, now - (i * 300000));
}

// Result: Bitcoin TRENDS (score > 1.2, high velocity, high novelty)
```

### Scenario 3: Emerging Topic (TRENDS)

```javascript
// New topic appears suddenly
trending.recordActivity('zk-rollups', {
  mentions: 12,
  users: new Set(['dev1', 'dev2', 'dev3', 'dev4']),
  keywords: ['rollups', 'scaling', 'ethereum', 'L2'],
  context: 'New ZK rollup announcement'
}, now);

// Result: ZK-Rollups TRENDS (high novelty, no baseline)
```

## API Reference

### AdaptiveTrending Class

#### Methods

##### `recordActivity(topic, data, timestamp)`
Records activity for a topic.

**Parameters:**
- `topic` (string): Topic name
- `data` (object):
  - `mentions` (number): Number of mentions
  - `users` (Set): Set of user IDs
  - `keywords` (Array<string>): Keywords from content
  - `context` (string): Content context
- `timestamp` (number): Activity timestamp (default: now)

##### `getTrendingTopics(limit)`
Returns trending topics above threshold.

**Parameters:**
- `limit` (number): Maximum topics to return (default: 5)

**Returns:** Array of trending topics:
```javascript
[{
  topic: 'bitcoin',
  score: 1.44,
  velocity: 2.0,
  novelty: 0.74,
  development: 0.60
}]
```

##### `getTopicDetails(topic)`
Gets detailed information about a topic's trending status.

##### `getBaseline(topic)`
Returns baseline activity metrics for a topic.

##### `cleanup(maxAgeHours)`
Removes old history data (default: 48 hours).

### ContextAccumulator Integration

#### Methods

##### `getAdaptiveTrendingTopics(options)`
Get trending topics using adaptive scoring.

**Parameters:**
- `options.limit` (number): Max topics (default: 5)
- `options.minScore` (number): Min trending score (default: 1.2)

##### `getCurrentActivity()`
Returns current activity with adaptive trending scores when enabled.

## Testing

Run the test suite:

```bash
npm test
```

Specific test files:
- `test/adaptiveTrending.test.js` - Core algorithm tests
- `test/contextAccumulator.adaptiveTrending.test.js` - Integration tests

Run the demo:

```bash
node demo-adaptive-trending.js
```

## Performance Considerations

- **Memory**: Maintains up to 100 history entries per topic (configurable)
- **Cleanup**: Automatic cleanup of old data (48+ hours)
- **Computation**: O(n) for trending calculation where n = number of topics
- **Caching**: Topic baselines cached and updated incrementally

## Benefits

✓ **Prevents "always trending" topics** - Baseline tracking ensures established topics don't dominate

✓ **Detects genuine developments** - Velocity and novelty scoring catch real spikes

✓ **Surfaces emerging topics** - New topics get high novelty scores

✓ **Context-aware** - Keyword tracking detects evolving narratives

✓ **Configurable** - Thresholds and windows tunable per use case

✓ **Backward compatible** - Falls back to frequency-based when disabled

## Architecture

```
┌─────────────────────────────────────────┐
│         NostrService                    │
│  (Uses trending for engagement boost)   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      ContextAccumulator                 │
│  - Processes events                     │
│  - Extracts topics & keywords           │
│  - Feeds to AdaptiveTrending            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      AdaptiveTrending                   │
│  - Tracks topic history                 │
│  - Calculates velocity                  │
│  - Detects novelty                      │
│  - Establishes baselines                │
│  - Computes trending scores             │
└─────────────────────────────────────────┘
```

## Future Enhancements

- [ ] Machine learning-based keyword importance weighting
- [ ] Sentiment-aware trending (positive vs negative spikes)
- [ ] Cross-topic correlation detection
- [ ] Personalized trending (user-specific interests)
- [ ] Real-time trending alerts/notifications
- [ ] Historical trending analysis and replay

## References

- Issue: [anabelle/pixel-agent#5](https://github.com/anabelle/pixel-agent/issues/5)
- Related: Semantic understanding (#1), Context accumulation (#4)
