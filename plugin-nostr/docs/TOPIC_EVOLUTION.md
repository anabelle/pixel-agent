# Topic Evolution Tracking

This feature adds semantic subtopic clustering and phase detection to track how topics evolve over time in conversations.

## Overview

The Topic Evolution system provides:

1. **Semantic Subtopic Clustering** - Identifies specific angles within broad topics (e.g., "bitcoin" → "bitcoin price volatility", "bitcoin ETF approval")
2. **Phase Detection** - Tracks discussion phases: speculation, announcement, analysis, adoption, backlash, general
3. **Novelty Scoring** - Rewards genuinely new angles and phase transitions
4. **Context Enrichment** - Surfaces relevant evolution data in conversation context

## Components

### TopicEvolutionTracker (`lib/topicEvolution.js`)

Main coordinator that:
- Labels subtopics using LLM (with fallback heuristics)
- Detects conversation phases based on keywords and content
- Calculates evolution scores based on novelty, phase changes, and diversity
- Generates human-readable signals for scoring metadata

**Key Methods:**
- `analyzeEvolution(topic, content, contextHints)` - Full evolution analysis
- `labelSubtopic(topic, content, contextHints)` - Extract specific angle
- `detectPhase(content, cluster)` - Identify discussion phase
- `scoreEvolution(cluster, subtopic, isNovel, isPhaseChange)` - Calculate novelty score

### NarrativeMemory Extensions (`lib/narrativeMemory.js`)

Stores and retrieves topic cluster data:
- `topicClusters` - In-memory Map of topic → cluster data
- `getTopicCluster(topic)` - Get or create cluster
- `updateTopicCluster(topic, entry)` - Add new entry
- Extended `getTopicEvolution(topic, days)` - Now includes subtopics, phase, and counts

**Cluster Structure:**
```javascript
{
  subtopics: Set,           // Unique subtopics seen
  entries: [],              // Historical entries (bounded)
  lastPhase: string,        // Most recent phase
  lastMentions: Map         // subtopic → timestamp
}
```

### SemanticAnalyzer Extensions (`lib/semanticAnalyzer.js`)

Adds subtopic labeling helper:
- `labelSubtopic(topic, content, contextHints)` - LLM-based labeling with fallback
- Caching for cost efficiency
- Graceful degradation when LLM unavailable

### Service Integration (`lib/service.js`)

Integrated into `_evaluateTimelineLoreCandidate`:
- Calls tracker for each candidate event
- Applies evolution score bonus (up to +0.5)
- Adds evolution signals to candidate metadata
- Passes context hints (trending topics, watchlist)

### Context Provider Enhancement (`lib/narrativeContextProvider.js`)

Enriches conversation context:
- Includes top subtopics when `includeTopicEvolution: true`
- Shows current phase for primary topic
- Formats evolution data concisely in summary

## Phase Taxonomy

Six conversation phases tracked:

1. **Speculation** - Early rumors and speculation
2. **Announcement** - Official releases and confirmations
3. **Analysis** - Technical reviews and deep dives
4. **Adoption** - Real-world usage and integration
5. **Backlash** - Criticism and controversies
6. **General** - Default/unclear phase

## Configuration

Environment variables:

```bash
# Enable/disable LLM for evolution tracking (default: true)
TOPIC_EVOLUTION_LLM_ENABLED=true

# Scoring weights (defaults shown)
TOPIC_EVOLUTION_NOVELTY_WEIGHT=0.4
TOPIC_EVOLUTION_PHASE_WEIGHT=0.3
TOPIC_EVOLUTION_RECENCY_WEIGHT=0.3

# Cluster size limit
TOPIC_CLUSTER_MAX_ENTRIES=100
```

## Usage Example

```javascript
// Evolution automatically tracked during candidate evaluation
const result = service._evaluateTimelineLoreCandidate(
  event,
  normalizedContent,
  { topics: ['bitcoin', 'ETF'] }
);

// Result includes evolution data
console.log(result.topicEvolution);
// {
//   subtopic: 'bitcoin ETF approval',
//   isNovelAngle: true,
//   isPhaseChange: true,
//   phase: 'announcement',
//   evolutionScore: 0.8,
//   signals: ['novel angle: bitcoin ETF approval', 'phase shift to announcement']
// }
```

## Benefits

1. **Prioritizes Novel Content** - Rewards genuinely new angles versus rehashed topics
2. **Tracks Conversation Flow** - Detects phase shifts from speculation → announcement → analysis
3. **Rich Context** - Provides up-to-date evolution data for prompts
4. **Cost Effective** - LLM calls are cached and bounded
5. **Graceful Fallback** - Works with or without LLM

## Testing

Comprehensive test suite covers:
- 51 test cases across 5 test files
- LLM-based and fallback labeling
- Phase detection for all 6 phases
- Novel angle detection
- Cluster management
- Service integration
- Context enrichment

Run tests:
```bash
npm test plugin-nostr/test/topicEvolution.test.js
npm test plugin-nostr/test/narrativeMemory.topicEvolution.test.js
npm test plugin-nostr/test/semanticAnalyzer.subtopic.test.js
npm test plugin-nostr/test/service.topicEvolution.test.js
npm test plugin-nostr/test/narrativeContextProvider.topicEvolution.test.js
```

## Architecture Notes

- **No Vector DB Required** - Uses simple in-memory clustering
- **Minimal LLM Calls** - Aggressive caching, bounded by batch size
- **Integrated Design** - Leverages existing SemanticAnalyzer and NarrativeMemory
- **Non-Breaking** - Gracefully degrades when components unavailable
- **Memory Bounded** - Cluster entries trimmed to configured max size

## Future Enhancements

Potential improvements (not in scope for this iteration):
- Embedding-based subtopic similarity
- Cross-topic evolution patterns
- Automated phase transition detection
- Cluster persistence to database
- Multi-topic evolution correlation
