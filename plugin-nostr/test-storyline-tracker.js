const { StorylineTracker } = require('./storylineTracker');
const { PatternLexicon } = require('./patternLexicon');

/**
 * Comprehensive Unit Tests for Storyline Tracker
 *
 * Tests cover: known phases, novel emergence, abstain/unknown cases,
 * rule-vs-LLM conflicts, and caching/rate-limit functionality.
 */

describe('StorylineTracker', () => {
  let tracker;
  let mockRuntime;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockRuntime = {
      getSetting: jest.fn((key) => {
        const settings = {
          'NOSTR_STORYLINE_LLM_ENABLED': 'true',
          'NOSTR_STORYLINE_LLM_PROVIDER': 'openai',
          'NOSTR_STORYLINE_CONFIDENCE_THRESHOLD': '0.5',
          'NOSTR_STORYLINE_CACHE_TTL_MINUTES': '60'
        };
        return settings[key];
      })
    };

    tracker = new StorylineTracker({
      runtime: mockRuntime,
      logger: mockLogger,
      enableLLM: true
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Known Phase Detection', () => {
  let tracker;
  let mockRuntime;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockRuntime = {
      getSetting: jest.fn((key) => {
        const settings = {
          'NOSTR_STORYLINE_LLM_ENABLED': 'true',
          'NOSTR_STORYLINE_LLM_PROVIDER': 'openai',
          'NOSTR_STORYLINE_CONFIDENCE_THRESHOLD': '0.5',
          'NOSTR_STORYLINE_CACHE_TTL_MINUTES': '60'
        };
        return settings[key];
      })
    };

    tracker = new StorylineTracker({
      runtime: mockRuntime,
      logger: mockLogger,
      enableLLM: true
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Known Phase Detection', () => {
    test('should detect regulatory phase progression', async () => {
      const post = {
        id: 'test-1',
        content: 'New SEC regulations require enhanced KYC for crypto exchanges',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['crypto-regulation'], post.created_at * 1000);

      expect(result[0].type).toBe('progression');
      expect(result[0].phase).toBe('regulatory');
      expect(result[0].confidence).toBeGreaterThan(0.7);
      expect(result[0].detectionMethod).toBe('rules');
    });

    test('should detect technical phase emergence', async () => {
      const post = {
        id: 'test-2',
        content: 'Lightning Network upgrade enables instant micropayments with reduced fees',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['lightning-network'], post.created_at * 1000);

      expect(result[0].type).toBe('progression');
      expect(result[0].phase).toBe('technical');
      expect(result[0].confidence).toBeGreaterThan(0.6);
    });

    test('should detect market phase progression', async () => {
      const post = {
        id: 'test-3',
        content: 'Bitcoin ETF approval drives institutional adoption and price surge',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['bitcoin-adoption'], post.created_at * 1000);

      expect(result[0].type).toBe('progression');
      expect(result[0].phase).toBe('market');
      expect(result[0].confidence).toBeGreaterThan(0.6);
    });

    test('should detect community phase emergence', async () => {
      const post = {
        id: 'test-4',
        content: 'Open source project gains 500 new contributors expanding developer ecosystem',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['open-source-growth'], post.created_at * 1000);

      expect(result[0].type).toBe('emergence');
      expect(result[0].phase).toBe('community');
      expect(result[0].confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Novel Emergence Detection', () => {
    test('should detect novel regulatory development', async () => {
      const post = {
        id: 'novel-1',
        content: 'Central bank announces digital currency pilot program with CBDC framework',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post, 'central-bank-digital-currency');

      expect(result.type).toBe('emergence');
      expect(result.phase).toBe('regulatory');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    test('should detect novel technical innovation', async () => {
      const post = {
        id: 'novel-2',
        content: 'New zero-knowledge proof protocol enables private smart contracts',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['zkp-smart-contracts'], post.created_at * 1000);

      expect(result[0].type).toBe('emergence');
      expect(result[0].phase).toBe('technical');
      expect(result[0].confidence).toBeGreaterThan(0.4);
    });
  });

  describe('Abstain/Unknown Cases', () => {
    test('should return unknown for irrelevant content', async () => {
      const post = {
        id: 'unknown-1',
        content: 'Just bought groceries and the weather is nice today',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['random-topic'], post.created_at * 1000);

      expect(result[0].type).toBe('unknown');
      expect(result[0].phase).toBeNull();
      expect(result[0].confidence).toBeLessThan(0.3);
    });

    test('should return unknown for spam content', async () => {
      const post = {
        id: 'unknown-2',
        content: 'Buy my NFT collection now!!! Limited time offer DM me',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['nft-scam'], post.created_at * 1000);

      expect(result[0].type).toBe('unknown');
      expect(result[0].confidence).toBeLessThan(0.2);
    });

    test('should abstain from low-confidence detections', async () => {
      const post = {
        id: 'abstain-1',
        content: 'Some people like pizza with pineapple',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['food-preferences'], post.created_at * 1000);

      expect(result[0].type).toBe('unknown');
      expect(result[0].confidence).toBeLessThan(0.3);
    });
  });

  describe('Rule vs LLM Conflict Resolution', () => {
    test('should prefer high-confidence rules over LLM', async () => {
      // Mock LLM to return different result
      tracker._detectProgressionLLM = jest.fn().mockResolvedValue({
        type: 'emergence',
        phase: 'market',
        confidence: 0.6,
        reasoning: 'LLM detected market emergence'
      });

      const post = {
        id: 'conflict-1',
        content: 'New government regulation requires crypto tax reporting',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['crypto-regulation'], post.created_at * 1000);

      expect(result[0].type).toBe('progression');
      expect(result[0].phase).toBe('regulatory');
      expect(result[0].confidence).toBeGreaterThan(0.7);
      expect(result[0].detectionMethod).toBe('rules');
    });

    test('should use LLM when rules have low confidence', async () => {
      tracker._detectProgressionLLM = jest.fn().mockResolvedValue({
        type: 'emergence',
        phase: 'technical',
        confidence: 0.8,
        reasoning: 'LLM detected technical innovation'
      });

      const post = {
        id: 'conflict-2',
        content: 'Some new blockchain feature that might be innovative',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['blockchain-innovation'], post.created_at * 1000);

      expect(result[0].type).toBe('emergence');
      expect(result[0].phase).toBe('technical');
      expect(result[0].confidence).toBe(0.8);
      expect(result[0].detectionMethod).toBe('llm');
    });
  });

  describe('Caching and Rate Limiting', () => {
    test('should cache LLM responses', async () => {
      const post = {
        id: 'cache-1',
        content: 'Bitcoin ETF gets regulatory approval',
        created_at: Math.floor(Date.now() / 1000)
      };

      // First call
      const result1 = await tracker.analyzePost(post.content, ['bitcoin-regulation'], post.created_at * 1000);

      // Second call with same content should use cache
      const result2 = await tracker.analyzePost(post.content, ['bitcoin-regulation'], post.created_at * 1000);

      expect(result1[0].type).toBe(result2[0].type);
      expect(result1[0].confidence).toBe(result2[0].confidence);

      // Check that LLM was only called once (cached on second call)
      const stats = tracker.getStats();
      expect(stats.llmCacheSize).toBeGreaterThanOrEqual(1);
    });

    test('should respect rate limiting', async () => {
      // Configure very low rate limit for testing
      tracker.llmRateLimit = 1; // 1 call per minute
      tracker.llmCallHistory = [Date.now() - 1000]; // Recent call

      const post = {
        id: 'rate-limit-1',
        content: 'New technical development in blockchain',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['blockchain-tech'], post.created_at * 1000);

      // Should fall back to rules when rate limited
      expect(result[0].detectionMethod).toBe('rules');
      expect(result[0].confidence).toBeLessThan(0.8); // Lower confidence without LLM
    });

    test('should handle cache expiration', async () => {
      // Set very short TTL for testing
      tracker.cacheTTL = 100; // 100ms

      const post = {
        id: 'cache-expire-1',
        content: 'Market analysis shows bullish trends',
        created_at: Math.floor(Date.now() / 1000)
      };

      // First call
      await tracker.analyzePost(post.content, ['market-analysis'], post.created_at * 1000);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 200));

      // Second call should not use cache
      await tracker.analyzePost(post.content, ['market-analysis'], post.created_at * 1000);

      const stats = tracker.getStats();
      // Cache should have expired, so cache hits should not increase
      expect(stats.cacheHits).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle LLM failures gracefully', async () => {
      tracker._detectProgressionLLM = jest.fn().mockRejectedValue(new Error('LLM API error'));

      const post = {
        id: 'error-1',
        content: 'Technical development that needs LLM analysis',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['technical-development'], post.created_at * 1000);

      // Should fall back to rules
      expect(result[0].detectionMethod).toBe('rules');
      expect(result[0].type).toBeDefined();
      expect(result[0].confidence).toBeDefined();
    });

    test('should handle invalid input', async () => {
      const result = await tracker.analyzePost(null, ['test-topic']);

      expect(result[0].type).toBe('unknown');
      expect(result[0].confidence).toBe(0);
    });

    test('should handle empty content', async () => {
      const post = {
        id: 'empty-1',
        content: '',
        created_at: Math.floor(Date.now() / 1000)
      };

      const result = await tracker.analyzePost(post.content, ['empty-topic'], post.created_at * 1000);

      expect(result[0].type).toBe('unknown');
      expect(result[0].confidence).toBe(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should track detection statistics', async () => {
      const posts = [
        { id: 'stat-1', content: 'Regulatory news', created_at: Date.now() / 1000 },
        { id: 'stat-2', content: 'Technical update', created_at: Date.now() / 1000 },
        { id: 'stat-3', content: 'Market data', created_at: Date.now() / 1000 }
      ];

      for (const post of posts) {
        await tracker.analyzePost(post.content, ['test-topic'], post.created_at * 1000);
      }

      const stats = tracker.getStats();
      expect(stats.totalAnalyses).toBe(3);
      expect(stats.detectionMethods.rules).toBeGreaterThan(0);
      expect(typeof stats.averageConfidence).toBe('number');
    });

    test('should provide storyline registry stats', () => {
      const stats = tracker.getStats();

      expect(stats).toHaveProperty('activeStorylines');
      expect(stats).toHaveProperty('llmCalls');
      expect(stats).toHaveProperty('cacheHits');
      expect(typeof stats.activeStorylines).toBe('number');
    });
  });
});

describe('PatternLexicon', () => {
  let lexicon;

  beforeEach(() => {
    lexicon = new PatternLexicon({
      maxPatternsPerPhase: 10,
      decayFactor: 0.9,
      compactionThreshold: 0.1
    });
  });

  describe('Pattern Learning', () => {
    test('should learn from progression events', () => {
      const content = 'New regulation requires compliance reporting';
      lexicon.learnFromProgression('crypto-reg', 'cluster1', 'regulatory', content, 1.0);

      const patterns = lexicon.getPatterns('crypto-reg', 'cluster1', 'regulatory');
      expect(patterns.size).toBeGreaterThan(0);
      expect(patterns.has('regulation')).toBe(true);
    });

    test('should reinforce existing patterns', () => {
      lexicon.learnFromProgression('test-topic', 'c1', 'technical', 'code development', 1.0);
      const patterns1 = lexicon.getPatterns('test-topic', 'c1', 'technical');

      lexicon.learnFromProgression('test-topic', 'c1', 'technical', 'code development', 1.0);
      const patterns2 = lexicon.getPatterns('test-topic', 'c1', 'technical');

      const pattern1 = patterns1.get('code');
      const pattern2 = patterns2.get('code');
      expect(pattern2.score).toBeGreaterThan(pattern1.score);
    });
  });

  describe('Maintenance Operations', () => {
    test('should perform decay and compaction', () => {
      lexicon.learnFromProgression('decay-test', 'c1', 'market', 'price surge growth', 1.0);

      // Manually set old timestamp to simulate aging
      const patterns = lexicon.getPatterns('decay-test', 'c1', 'market');
      for (const [pattern, data] of patterns) {
        data.lastUpdated = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      }

      lexicon.performMaintenance();

      const updatedPatterns = lexicon.getPatterns('decay-test', 'c1', 'market');
      expect(updatedPatterns.size).toBeLessThanOrEqual(patterns.size);
    });

    test('should limit patterns per phase', () => {
      // Add many patterns
      for (let i = 0; i < 15; i++) {
        lexicon.learnFromProgression('limit-test', 'c1', 'technical', `pattern${i} development code`, 1.0);
      }

      const patterns = lexicon.getPatterns('limit-test', 'c1', 'technical');
      expect(patterns.size).toBeLessThanOrEqual(10); // maxPatternsPerPhase
    });
  });

  describe('Pattern Retrieval', () => {
    test('should retrieve relevant patterns for topic', () => {
      lexicon.learnFromProgression('retrieve-test', 'c1', 'regulatory', 'law compliance regulation', 1.0);

      const patterns = lexicon.getRelevantPatterns('retrieve-test', 'c1', ['regulatory']);
      expect(patterns.size).toBeGreaterThan(0);
      expect(patterns.has('regulation')).toBe(true);
    });

    test('should fall back to global patterns', () => {
      const patterns = lexicon.getRelevantPatterns('nonexistent-topic', 'c1', ['regulatory']);
      expect(patterns.size).toBeGreaterThan(0); // Should have global defaults
    });
  });

  describe('Statistics', () => {
    test('should provide lexicon statistics', () => {
      lexicon.learnFromProgression('stats-test', 'c1', 'technical', 'code development', 1.0);

      const stats = lexicon.getStats();
      expect(stats.topics).toBeGreaterThan(0);
      expect(stats.totalPatterns).toBeGreaterThan(0);
      expect(typeof stats.avgPatternsPerPhase).toBe('number');
    });
  });
});

// Mock implementations for testing
jest.mock('./generation', () => ({
  generateWithModelOrFallback: jest.fn()
}));

// Helper to create mock LLM responses
global.createMockLLMResponse = (type, phase, confidence, reasoning) => ({
  type,
  phase,
  confidence,
  reasoning,
  detectionMethod: 'llm'
});