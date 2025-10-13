# Semantic Topic Evolution Feature

This PR implements semantic topic evolution tracking with subtopics, phases, and contextual scoring as specified in the issue.

## What's Changed

### New Components

1. **TopicEvolutionTracker** (`lib/topicEvolution.js`)
   - Semantic subtopic labeling using LLM with fallback heuristics
   - 6-phase taxonomy tracking (speculation → announcement → analysis → adoption → backlash → general)
   - Novel angle detection with similarity checking
   - Evolution scoring based on novelty, phase changes, and diversity
   - Aggressive caching to minimize LLM costs

2. **NarrativeMemory Extensions** (`lib/narrativeMemory.js`)
   - In-memory topic cluster storage (`topicClusters` Map)
   - `getTopicCluster(topic)` - Get or create cluster
   - `updateTopicCluster(topic, entry)` - Add cluster entry
   - Extended `getTopicEvolution()` to include subtopics, phase, and counts

3. **SemanticAnalyzer Extensions** (`lib/semanticAnalyzer.js`)
   - `labelSubtopic(topic, content, contextHints)` - LLM-based with fallback
   - Integrated caching for cost efficiency

4. **Service Integration** (`lib/service.js`)
   - Evolution tracking in `_evaluateTimelineLoreCandidate`
   - Evolution score bonus (up to +0.5) applied to candidates
   - Evolution signals added to candidate metadata
   - Context hints passed to tracker (trending, watchlist)

5. **Context Provider Enhancement** (`lib/narrativeContextProvider.js`)
   - Top subtopics included when `includeTopicEvolution: true`
   - Current phase shown for primary topic
   - Concise evolution formatting in context summary

### Testing

**51 test cases** across 5 test files:
- `test/topicEvolution.test.js` - Core tracker functionality
- `test/narrativeMemory.topicEvolution.test.js` - Memory extensions
- `test/semanticAnalyzer.subtopic.test.js` - Analyzer extensions
- `test/service.topicEvolution.test.js` - Service integration
- `test/narrativeContextProvider.topicEvolution.test.js` - Context enrichment

All tests pass and validate both LLM and fallback code paths.

### Documentation

- `docs/TOPIC_EVOLUTION.md` - Comprehensive technical guide
- `demo-topic-evolution.js` - Working demo script

## Key Features

### 1. Semantic Subtopic Clustering
Distinguishes between broad topics and specific angles:
- "bitcoin" → "bitcoin price volatility", "bitcoin ETF approval", "bitcoin mining"
- Uses LLM for nuanced understanding, falls back to keyword patterns

### 2. Phase Detection
Tracks conversation lifecycle through 6 phases:
- **Speculation** - Rumors and early speculation
- **Announcement** - Official releases
- **Analysis** - Technical deep dives
- **Adoption** - Real-world usage
- **Backlash** - Criticism and concerns
- **General** - Default phase

### 3. Novel Angle Detection
- Identifies genuinely new angles vs rehashed content
- Uses word overlap similarity (Jaccard) to detect similar subtopics
- 24-hour recency window - angles not mentioned in 24h are considered novel

### 4. Evolution Scoring
Combines three factors:
- **Novelty** (40% weight) - Rewards new angles
- **Phase Change** (30% weight) - Rewards phase transitions
- **Diversity** (30% weight) - Rewards varied discussion

Score range: 0.0 - 1.0, applied as bonus up to +0.5 in candidate scoring

### 5. Context Enrichment
When `includeTopicEvolution: true`:
```
BITCOIN: phase: announcement; angles: ETF approval, price volatility
```

## Configuration

```bash
# Enable/disable LLM (default: true)
TOPIC_EVOLUTION_LLM_ENABLED=true

# Scoring weights
TOPIC_EVOLUTION_NOVELTY_WEIGHT=0.4
TOPIC_EVOLUTION_PHASE_WEIGHT=0.3
TOPIC_EVOLUTION_RECENCY_WEIGHT=0.3

# Cluster entry limit
TOPIC_CLUSTER_MAX_ENTRIES=100
```

## Architecture Decisions

✅ **No Vector DB** - Simple in-memory clustering sufficient for MVP
✅ **Minimal LLM Calls** - Aggressive caching, bounded by batch size  
✅ **Graceful Degradation** - Works with or without LLM
✅ **Non-Breaking** - All changes are additive
✅ **Memory Bounded** - Cluster entries auto-trimmed to max size
✅ **Integrated Design** - Leverages existing SemanticAnalyzer and NarrativeMemory

## Demo Output

```bash
$ node plugin-nostr/demo-topic-evolution.js

Event 1: "Rumor has it that Bitcoin ETF might be approved soon"
  Subtopic: etf approval
  Phase: speculation
  Novel Angle: YES
  Evolution Score: 0.55

Event 2: "Official announcement: Bitcoin ETF approved by SEC"
  Subtopic: etf approval
  Phase: announcement
  Novel Angle: NO
  Phase Change: YES
  Evolution Score: 0.45

Final cluster state for "bitcoin":
  Unique subtopics: 4
  Current phase: announcement
  Subtopics: etf approval, mining activity, mainstream adoption, price volatility
```

## Files Changed

### Modified (5 files)
- `plugin-nostr/lib/narrativeMemory.js` - Added cluster storage (+105 lines)
- `plugin-nostr/lib/semanticAnalyzer.js` - Added subtopic helper (+78 lines)
- `plugin-nostr/lib/service.js` - Integrated tracker (+45 lines)
- `plugin-nostr/lib/narrativeContextProvider.js` - Enhanced context (+20 lines)

### Added (8 files)
- `plugin-nostr/lib/topicEvolution.js` - Main tracker (477 lines)
- `plugin-nostr/test/topicEvolution.test.js` (404 lines)
- `plugin-nostr/test/narrativeMemory.topicEvolution.test.js` (341 lines)
- `plugin-nostr/test/semanticAnalyzer.subtopic.test.js` (294 lines)
- `plugin-nostr/test/service.topicEvolution.test.js` (386 lines)
- `plugin-nostr/test/narrativeContextProvider.topicEvolution.test.js` (348 lines)
- `plugin-nostr/docs/TOPIC_EVOLUTION.md` (172 lines)
- `plugin-nostr/demo-topic-evolution.js` (162 lines)

**Total**: ~2,832 lines added (including tests and docs)

## Benefits

1. **Better Content Prioritization** - Genuinely novel angles score higher
2. **Phase-Aware Responses** - Agent knows if topic is speculation vs confirmed
3. **Richer Context** - Prompts include current subtopic landscape
4. **Cost Effective** - LLM calls minimized through caching
5. **Reliable** - Graceful fallbacks ensure robustness

## Non-Goals (Explicitly Out of Scope)

- ❌ Vector embeddings or embedding-based similarity
- ❌ External vector database integration
- ❌ Change to public posting behavior (only scoring/context)
- ❌ Heavy ML/AI stack beyond small LLM calls
- ❌ Persistence of clusters to database (in-memory only)

## Testing

All tests can be run with:
```bash
npm test plugin-nostr/test/topicEvolution.test.js
npm test plugin-nostr/test/narrativeMemory.topicEvolution.test.js
npm test plugin-nostr/test/semanticAnalyzer.subtopic.test.js
npm test plugin-nostr/test/service.topicEvolution.test.js
npm test plugin-nostr/test/narrativeContextProvider.topicEvolution.test.js
```

Or run the demo:
```bash
node plugin-nostr/demo-topic-evolution.js
```

## Future Enhancements (Not in This PR)

Potential improvements for future iterations:
- Embedding-based subtopic similarity
- Cross-topic evolution correlation
- Cluster persistence to database
- Automated phase transition alerts
- Multi-topic evolution pattern detection
