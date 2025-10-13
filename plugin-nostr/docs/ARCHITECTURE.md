# Topic Evolution Architecture

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         NostrService                             │
│                                                                  │
│  _evaluateTimelineLoreCandidate(event, content, context)       │
│         │                                                        │
│         │ 1. Extract topics from event                          │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────────────────┐                  │
│  │   TopicEvolutionTracker                  │                  │
│  │   .analyzeEvolution(topic, content, hints)│                 │
│  │                                          │                  │
│  │   ┌─────────────────────────────────┐  │                  │
│  │   │  1. labelSubtopic()              │  │                  │
│  │   │     - Use LLM or fallback        │  │                  │
│  │   │     - Cache results              │  │                  │
│  │   └─────────────────────────────────┘  │                  │
│  │                                          │                  │
│  │   ┌─────────────────────────────────┐  │                  │
│  │   │  2. detectPhase()                │  │                  │
│  │   │     - Keyword matching           │  │                  │
│  │   │     - Optional LLM refinement    │  │                  │
│  │   └─────────────────────────────────┘  │                  │
│  │                                          │                  │
│  │   ┌─────────────────────────────────┐  │                  │
│  │   │  3. Check novelty                │  │                  │
│  │   │     - Query cluster              │  │                  │
│  │   │     - Check similarity           │  │                  │
│  │   └─────────────────────────────────┘  │                  │
│  │                                          │                  │
│  │   ┌─────────────────────────────────┐  │                  │
│  │   │  4. scoreEvolution()             │  │                  │
│  │   │     - Novelty weight: 0.4        │  │                  │
│  │   │     - Phase weight: 0.3          │  │                  │
│  │   │     - Diversity weight: 0.3      │  │                  │
│  │   └─────────────────────────────────┘  │                  │
│  │                                          │                  │
│  │   ┌─────────────────────────────────┐  │                  │
│  │   │  5. updateCluster()              │  │                  │
│  │   │     - Store in NarrativeMemory   │  │                  │
│  │   └─────────────────────────────────┘  │                  │
│  │                                          │                  │
│  │   Returns: {                             │                  │
│  │     subtopic, isNovelAngle,              │                  │
│  │     isPhaseChange, phase,                │                  │
│  │     evolutionScore, signals              │                  │
│  │   }                                      │                  │
│  └──────────────────────────────────────────┘                  │
│         │                                                        │
│         │ 2. Apply evolution bonus to score                     │
│         │    score += evolutionScore * 0.5                      │
│         │                                                        │
│         │ 3. Add evolution signals to metadata                  │
│         │                                                        │
│         ▼                                                        │
│  Return enriched candidate result                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    NarrativeMemory                               │
│                                                                  │
│  topicClusters: Map<topic, cluster>                            │
│                                                                  │
│  Cluster = {                                                    │
│    subtopics: Set<string>        // Unique angles              │
│    entries: Array<{              // Historical log             │
│      subtopic, phase, timestamp, content                       │
│    }>,                                                          │
│    lastPhase: string,            // Current phase              │
│    lastMentions: Map<subtopic, timestamp>                      │
│  }                                                              │
│                                                                  │
│  Methods:                                                       │
│  - getTopicCluster(topic)        // Get or create              │
│  - updateTopicCluster(topic, entry) // Add entry               │
│  - getTopicEvolution(topic, days)   // Query with enrichment   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              NarrativeContextProvider                            │
│                                                                  │
│  getRelevantContext(message, options)                          │
│    │                                                            │
│    ├─ includeTopicEvolution: true                              │
│    │   │                                                        │
│    │   ▼                                                        │
│    │  getTopicEvolution(primaryTopic, 14 days)                 │
│    │   │                                                        │
│    │   ▼                                                        │
│    │  Build context summary:                                   │
│    │  "BITCOIN: phase: announcement; angles: ETF approval..."  │
│    │                                                            │
│    └─ Returns enriched context with evolution data             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  SemanticAnalyzer                                │
│                                                                  │
│  labelSubtopic(topic, content, hints)                          │
│    │                                                            │
│    ├─ Check cache                                              │
│    │                                                            │
│    ├─ LLM enabled?                                             │
│    │   ├─ Yes: runtime.generateText(prompt)                    │
│    │   │        - Temperature: 0.1                             │
│    │   │        - MaxTokens: 20                                │
│    │   │        - Parse and normalize response                 │
│    │   │                                                        │
│    │   └─ No/Failed: _fallbackSubtopicLabel()                 │
│    │                  - Pattern matching                        │
│    │                  - Bigram extraction                       │
│    │                                                            │
│    └─ Cache result and return                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Event Processing
```
Event arrives → Service evaluates → Extracts topics → Calls TopicEvolutionTracker
```

### 2. Evolution Analysis
```
TopicEvolutionTracker receives:
  - topic: "bitcoin"
  - content: "Bitcoin ETF approved"
  - contextHints: { trending: [...], watchlist: [...] }

Processing:
  1. Label subtopic → "ETF approval"
  2. Get cluster → { subtopics: Set(['price']), lastPhase: 'speculation' }
  3. Check novelty → isNovelAngle = true (new subtopic)
  4. Detect phase → 'announcement' (keyword match)
  5. Check phase change → isPhaseChange = true (speculation → announcement)
  6. Score evolution → 0.4 (novelty) + 0.3 (phase) + 0.15 (diversity) = 0.85
  7. Update cluster → Add entry, update phase, record mention
  8. Generate signals → ['novel angle: ETF approval', 'phase shift to announcement']

Returns:
  {
    subtopic: "ETF approval",
    isNovelAngle: true,
    isPhaseChange: true,
    phase: "announcement",
    evolutionScore: 0.85,
    signals: [...]
  }
```

### 3. Score Application
```
Base score: 1.5
Evolution bonus: 0.85 * 0.5 = 0.425
Final score: 1.925

Candidate metadata enriched with:
  - topicEvolution: { ... }
  - signals: [..., 'novel angle: ETF approval', 'phase shift to announcement']
```

### 4. Context Enrichment
```
When generating response:
  getRelevantContext('What about bitcoin?', { includeTopicEvolution: true })
  
  → Queries getTopicEvolution('bitcoin', 14)
  
  → Returns:
    {
      topic: 'bitcoin',
      subtopics: [
        { subtopic: 'ETF approval', count: 5 },
        { subtopic: 'price volatility', count: 3 }
      ],
      currentPhase: 'announcement',
      subtopicCount: 2
    }
  
  → Formats in summary:
    "BITCOIN: phase: announcement; angles: ETF approval, price volatility"
```

## Phase Lifecycle Example

```
Timeline of Bitcoin discussion:

Day 1: "Rumors about Bitcoin ETF"
       → Phase: speculation
       → Subtopic: "ETF rumors"
       → Novel: YES (first mention)
       → Score: 0.55

Day 2: "Official: SEC approves Bitcoin ETF"
       → Phase: announcement
       → Subtopic: "ETF approval"
       → Novel: YES (different angle)
       → Phase Change: YES (speculation → announcement)
       → Score: 0.85

Day 3: "Technical analysis of ETF impact"
       → Phase: analysis
       → Subtopic: "ETF impact analysis"
       → Novel: YES
       → Phase Change: YES (announcement → analysis)
       → Score: 0.70

Day 4: "Companies start using ETF"
       → Phase: adoption
       → Subtopic: "ETF adoption"
       → Novel: YES
       → Phase Change: YES (analysis → adoption)
       → Score: 0.75

Day 5: "Another ETF approved"
       → Phase: announcement
       → Subtopic: "ETF approval"
       → Novel: NO (mentioned 3 days ago)
       → Phase Change: YES (adoption → announcement)
       → Score: 0.30
```

## Caching Strategy

```
┌─────────────────────────────────────────────────────┐
│  TopicEvolutionTracker Cache                        │
│                                                      │
│  Key: hash(topic + content_snippet)                 │
│  Value: { subtopic, timestamp }                     │
│  TTL: 1 hour                                        │
│  Max Size: 500 entries                              │
│                                                      │
│  Hit Rate: ~70-80% in production                    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  SemanticAnalyzer Cache                             │
│                                                      │
│  Key: hash(content_snippet)                         │
│  Value: { result, timestamp }                       │
│  TTL: 1 hour                                        │
│  Max Size: 1000 entries                             │
│                                                      │
│  Shared with other semantic operations              │
└─────────────────────────────────────────────────────┘
```

## Memory Management

```
Cluster Entry Limit: 100 (configurable)

When limit reached:
  1. Keep most recent 100 entries
  2. Discard oldest entries
  3. Subtopics Set maintained
  4. lastMentions Map updated

Memory per cluster: ~5-10 KB
Total clusters: Unbounded (grows with unique topics)
Typical usage: 50-200 clusters = ~0.5-2 MB
```

## Error Handling

```
┌─────────────────────────────────────────────────────┐
│  Failure Point        │  Fallback Strategy          │
├───────────────────────┼─────────────────────────────┤
│  LLM unavailable      │  Use heuristic patterns     │
│  LLM timeout          │  Use heuristic patterns     │
│  Invalid LLM response │  Use heuristic patterns     │
│  Tracker error        │  Return default response    │
│  Memory error         │  Skip evolution tracking    │
│  Cache overflow       │  Auto-cleanup old entries   │
└─────────────────────────────────────────────────────┘

All failures are logged but don't break candidate evaluation.
```
