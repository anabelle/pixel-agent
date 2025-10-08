# Pixel Memory System - Developer Guide

## Overview

Pixel's memory system is a sophisticated multi-layered architecture that enables deep contextual awareness, intelligent conversation threading, and adaptive behavior. This guide provides technical details for developers working with or extending Pixel's memory capabilities.

## Architecture Overview

The memory system consists of four main layers:

1. **User Interaction Layer**: Context accumulation from various sources
2. **Intelligence Processing Layer**: LLM-powered analysis and multi-model integration
3. **Memory Persistence Layer**: Narrative memory, user profiles, and self-reflection
4. **Platform Integration Layer**: Thread-aware discovery and cross-platform continuity

## Core Components

### Context Accumulator

**Location**: `plugin-nostr/lib/contextAccumulator.js`

The Context Accumulator builds comprehensive context before response generation by combining:
- Recent conversation history
- User profile information
- Thread context and relationships
- Platform-specific behavioral data
- Temporal patterns and scheduling

**Key Methods:**
```javascript
class ContextAccumulator {
  // Build complete context for a message
  async buildContext(message, runtime) {
    const history = await this.getConversationHistory(message.roomId);
    const profile = await this.getUserProfile(message.userId);
    const thread = await this.getThreadContext(message);
    const platform = this.getPlatformContext(message.platform);

    return this.mergeAndPrioritize({ history, profile, thread, platform });
  }

  // Get recent conversation history with relevance scoring
  async getConversationHistory(roomId, limit = 50) {
    // Implementation with intelligent filtering
  }

  // Retrieve and update user profile
  async getUserProfile(userId) {
    // Implementation with profile evolution
  }
}
```

### Narrative Memory System

**Location**: `plugin-nostr/lib/memory.js`

Maintains story arcs, character development, and long-term memory.

**Memory Types:**
- **Personal Evolution**: Pixel's own growth and changes
- **Community Stories**: Collective user experiences
- **Event Memory**: Significant occurrences and milestones
- **Relationship Dynamics**: User interaction patterns

**Implementation:**
```javascript
class NarrativeMemory {
  // Store a narrative memory
  async storeMemory(type, content, importance = 1.0) {
    const memory = {
      id: generateId(),
      type,
      content,
      importance,
      timestamp: new Date(),
      context: this.currentContext
    };

    await this.persistMemory(memory);
    this.updateNarrativeArc(memory);
  }

  // Retrieve relevant memories for context
  async getRelevantMemories(query, limit = 10) {
    // Semantic search implementation
  }

  // Update narrative arcs based on new information
  updateNarrativeArc(memory) {
    // Implementation for story continuity
  }
}
```

### User Profile Manager

**Location**: `plugin-nostr/lib/contacts.js`

Creates and maintains detailed user profiles for personalized interactions.

**Profile Structure:**
```javascript
interface UserProfile {
  userId: string;
  basicInfo: {
    name: string;
    platforms: string[];
    firstInteraction: Date;
    lastInteraction: Date;
  };
  communication: {
    style: 'formal' | 'casual' | 'technical' | 'humorous';
    preferredTopics: string[];
    responsePatterns: string[];
  };
  behavioral: {
    interactionFrequency: number;
    successfulInteractions: number;
    preferredTimes: string[];
    engagementLevel: number;
  };
  relationship: {
    trustLevel: number;
    friendshipScore: number;
    sharedInterests: string[];
  };
}
```

**Key Features:**
- **Pattern Recognition**: Identifies user communication patterns
- **Preference Learning**: Learns optimal interaction strategies
- **Relationship Tracking**: Maintains relationship dynamics
- **Cross-Platform Unification**: Links profiles across platforms

### Self-Reflection Engine

**Integrated throughout the system**

Enables Pixel to analyze and improve its own behavior through:
- **Performance Analysis**: Success rates of different approaches
- **Behavioral Adaptation**: Learning from interaction outcomes
- **Personality Consistency**: Maintaining character traits
- **Error Recognition**: Identifying and correcting issues

## Thread-Aware Discovery

**Location**: `plugin-nostr/lib/discovery.js`

Intelligent conversation threading across platforms.

**Thread Management:**
```javascript
class ThreadManager {
  // Create or update a conversation thread
  async manageThread(message) {
    const existingThread = await this.findRelatedThread(message);

    if (existingThread) {
      return this.updateThread(existingThread, message);
    } else {
      return this.createNewThread(message);
    }
  }

  // Find related threads using semantic similarity
  async findRelatedThread(message) {
    const messageEmbedding = await this.getEmbedding(message.content);
    const similarThreads = await this.findSimilarThreads(messageEmbedding);

    return this.selectBestMatch(similarThreads, message);
  }

  // Maintain thread continuity across platforms
  async bridgePlatforms(threadId, newPlatform) {
    // Implementation for cross-platform context transfer
  }
}
```

## Data Persistence

### Database Schema

**Primary Tables:**
```sql
-- Conversation history with full context
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMP NOT NULL,
  thread_id UUID REFERENCES threads(id)
);

-- User profiles with evolution tracking
CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY,
  profile_data JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  last_updated TIMESTAMP NOT NULL,
  interaction_count INTEGER DEFAULT 0
);

-- Narrative memories
CREATE TABLE narrative_memories (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  content JSONB NOT NULL,
  importance REAL DEFAULT 1.0,
  created_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP
);

-- Conversation threads
CREATE TABLE threads (
  id UUID PRIMARY KEY,
  title TEXT,
  participants TEXT[] NOT NULL,
  platforms TEXT[] NOT NULL,
  context_summary TEXT,
  last_activity TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'active'
);
```

### Storage Optimization

**Features:**
- **Automatic Compression**: Large content compression
- **Intelligent Pruning**: Remove outdated/low-importance data
- **Indexing Strategy**: Optimized queries for common access patterns
- **Backup Automation**: Regular snapshots and recovery

## AI Model Integration

### Multi-Model System

**Model Router:**
```javascript
class ModelRouter {
  // Select appropriate model for task
  selectModel(task, context) {
    const models = {
      conversation: 'mistral',
      analysis: 'gpt-5-nano',
      creative: 'deepseek',
      technical: 'claude',
      visual: 'gemini'
    };

    const selected = models[task] || 'mistral';

    // Check model availability and performance
    return this.validateModelSelection(selected, context);
  }

  // Fallback handling
  async executeWithFallback(task, context) {
    const primary = this.selectModel(task, context);
    const fallback = this.getFallbackModel(primary);

    try {
      return await this.executeOnModel(primary, task, context);
    } catch (error) {
      console.warn(`Model ${primary} failed, trying ${fallback}`);
      return await this.executeOnModel(fallback, task, context);
    }
  }
}
```

### Provider Fallback System

**Location**: `src/provider-fallback-plugin.ts`

Handles automatic failover between AI providers:
- **Health Monitoring**: Continuous provider status checking
- **Quality Assessment**: Response quality evaluation
- **Cost Optimization**: Intelligent provider selection
- **Rate Limit Management**: Automatic switching under limits

## Platform Integration

### Cross-Platform Context Bridge

**Location**: `plugin-nostr/lib/bridge.js`

**Features:**
- **Context Transfer**: Seamless context movement between platforms
- **Identity Unification**: Consistent user identification across platforms
- **Thread Continuity**: Maintaining conversation threads across platforms
- **Platform Adaptation**: Optimizing behavior per platform

### Real-Time Event Processing

**WebSocket Integration:**
```javascript
class PlatformBridge {
  // Handle real-time events from LNPixels
  async handleRealtimeEvent(event) {
    // Deduplication
    if (await this.isDuplicateEvent(event)) {
      return;
    }

    // Context building
    const context = await this.buildEventContext(event);

    // Memory storage
    await this.storeEventMemory(event, context);

    // Cross-platform distribution
    await this.distributeToPlatforms(event, context);
  }

  // Anti-spam and rate limiting
  async shouldThrottleEvent(event) {
    const recentEvents = await this.getRecentEvents(event.type, 3600000); // 1 hour
    return recentEvents.length > this.maxEventsPerHour;
  }
}
```

## Performance Optimization

### Memory Efficiency

**Techniques:**
- **Context Window Management**: Efficient LLM context usage
- **Memory Pooling**: Reuse of common context elements
- **Lazy Loading**: On-demand context building
- **Background Processing**: Non-blocking memory operations

### Caching Strategy

**Multi-Level Caching:**
```javascript
class MemoryCache {
  // L1: In-memory cache for hot data
  l1Cache = new Map();

  // L2: Redis/external cache for warm data
  l2Cache = new Redis();

  // L3: Database for cold data
  database = new Database();

  async get(key) {
    // Check L1 first
    let data = this.l1Cache.get(key);
    if (data) return data;

    // Check L2
    data = await this.l2Cache.get(key);
    if (data) {
      this.l1Cache.set(key, data); // Promote to L1
      return data;
    }

    // Check database
    data = await this.database.get(key);
    if (data) {
      this.l2Cache.set(key, data); // Promote to L2
      this.l1Cache.set(key, data); // Promote to L1
    }

    return data;
  }
}
```

## Testing & Development

### Memory System Testing

**Test Categories:**
```javascript
describe('Memory System Tests', () => {
  describe('Context Accumulator', () => {
    test('builds comprehensive context', async () => {
      const accumulator = new ContextAccumulator();
      const context = await accumulator.buildContext(mockMessage, mockRuntime);

      expect(context.history).toBeDefined();
      expect(context.profile).toBeDefined();
      expect(context.thread).toBeDefined();
    });

    test('prioritizes recent interactions', async () => {
      // Test temporal weighting
    });
  });

  describe('User Profile Evolution', () => {
    test('updates profile based on interactions', async () => {
      // Test profile learning
    });

    test('maintains consistency across platforms', async () => {
      // Test cross-platform profile linking
    });
  });

  describe('Thread Management', () => {
    test('correctly links related messages', async () => {
      // Test thread discovery
    });

    test('maintains continuity across platforms', async () => {
      // Test cross-platform threading
    });
  });
});
```

### Development Tools

**Memory Debugging:**
```javascript
class MemoryDebugger {
  // Inspect current memory state
  async inspectMemory(userId) {
    const profile = await this.getUserProfile(userId);
    const threads = await this.getActiveThreads(userId);
    const memories = await this.getRecentMemories(userId);

    return { profile, threads, memories };
  }

  // Analyze memory performance
  async analyzePerformance() {
    const metrics = {
      contextBuildTime: await this.measureContextBuildTime(),
      memoryRetrievalSpeed: await this.measureRetrievalSpeed(),
      cacheHitRate: await this.measureCacheEfficiency()
    };

    return metrics;
  }
}
```

## Configuration

### Environment Variables

```env
# Memory System
MEMORY_MAX_CONTEXT_SIZE=4000
MEMORY_COMPRESSION_THRESHOLD=1000
MEMORY_PRUNE_INTERVAL=86400000
MEMORY_BACKUP_RETENTION=30

# Database
DATABASE_URL=postgresql://localhost:5432/pixel
MEMORY_POOL_SIZE=10
MEMORY_STATEMENT_TIMEOUT=30000

# AI Models
PRIMARY_MODEL=mistral
FALLBACK_MODELS=gpt-5-nano,claude
MODEL_TIMEOUT=30000
MODEL_RETRY_ATTEMPTS=3

# Platform Integration
CONTEXT_SYNC_ENABLED=true
THREAD_DISCOVERY_ENABLED=true
PROFILE_UPDATE_ENABLED=true
REALTIME_EVENTS_ENABLED=true

# Performance
MEMORY_CACHE_SIZE=1000
MEMORY_WORKER_THREADS=4
MEMORY_BATCH_SIZE=50
```

## Monitoring & Observability

### Key Metrics

**Memory System Metrics:**
- **Context Build Latency**: Time to accumulate context
- **Memory Retrieval Speed**: Database query performance
- **Thread Resolution Accuracy**: Correctness of thread linking
- **Profile Freshness**: How current user profiles are

**AI Integration Metrics:**
- **Model Response Time**: AI model performance
- **Fallback Rate**: How often fallback models are used
- **Error Rate**: Model failure rates

**Platform Integration Metrics:**
- **Event Processing Latency**: Real-time event handling
- **Cross-Platform Sync Success**: Context transfer success rate
- **Thread Continuity**: Thread maintenance across platforms

### Logging

**Structured Logging:**
```javascript
class MemoryLogger {
  logContextBuild(context, duration) {
    this.logger.info('Context built', {
      userId: context.userId,
      sources: Object.keys(context),
      duration,
      timestamp: new Date()
    });
  }

  logMemoryOperation(operation, success, duration) {
    this.logger.info('Memory operation', {
      operation,
      success,
      duration,
      error: success ? null : error.message
    });
  }
}
```

## Troubleshooting

### Common Issues

**Context Loss:**
```bash
# Check database connectivity
psql $DATABASE_URL -c "SELECT COUNT(*) FROM conversations;"

# Verify memory tables exist
psql $DATABASE_URL -c "\dt memory_*"

# Check memory service logs
tail -f logs/memory.log
```

**Thread Breaks:**
```bash
# Inspect thread linking
node -e "
const threads = await getThreadsForUser('user123');
console.log('Active threads:', threads.length);
"

# Check thread discovery settings
echo $THREAD_DISCOVERY_ENABLED
```

**Performance Issues:**
```bash
# Monitor memory usage
top -p $(pgrep -f pixel)

# Check cache hit rates
curl http://localhost:9090/metrics | grep cache

# Analyze slow queries
psql $DATABASE_URL -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

**Profile Inconsistencies:**
```bash
# Validate profile data
node -e "
const profile = await getUserProfile('user123');
console.log('Profile version:', profile.version);
console.log('Last updated:', profile.lastUpdated);
"

# Check profile update jobs
crontab -l | grep profile
```

## Extending the Memory System

### Adding New Memory Types

1. **Define the memory structure**
```javascript
interface CustomMemory {
  id: string;
  type: 'custom';
  content: CustomContent;
  importance: number;
  metadata: CustomMetadata;
}
```

2. **Implement storage and retrieval**
```javascript
class CustomMemoryManager {
  async store(memory) {
    // Custom storage logic
  }

  async retrieve(query) {
    // Custom retrieval logic
  }
}
```

3. **Integrate with context accumulator**
```javascript
// In ContextAccumulator
async getCustomContext(userId) {
  const customMemories = await customMemoryManager.retrieve({ userId });
  return this.processCustomMemories(customMemories);
}
```

### Custom Context Providers

1. **Create a context provider**
```javascript
class CustomContextProvider {
  name = 'custom';

  async get(runtime, message, state) {
    const customData = await this.fetchCustomData(message);
    return {
      text: this.formatCustomData(customData),
      data: customData
    };
  }
}
```

2. **Register the provider**
```javascript
// In plugin registration
export const customPlugin: Plugin = {
  name: 'custom-memory',
  providers: [new CustomContextProvider()],
  // ... other plugin configuration
};
```

This developer guide provides the technical foundation for understanding and extending Pixel's sophisticated memory system. The architecture is designed to be modular and extensible, allowing for continuous improvement and adaptation.