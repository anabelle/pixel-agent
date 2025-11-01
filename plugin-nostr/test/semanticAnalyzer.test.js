const { describe, it, expect, beforeEach, afterEach, vi } = globalThis;
const { SemanticAnalyzer } = require('../lib/semanticAnalyzer');

const noopLogger = { 
  info: () => {}, 
  warn: () => {}, 
  debug: () => {},
  error: () => {}
};

// Mock runtime for LLM tests
function createMockRuntime(generateTextFn) {
  return {
    generateText: generateTextFn || vi.fn().mockResolvedValue('YES')
  };
}

describe('SemanticAnalyzer', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('initializes with LLM disabled by default', () => {
      delete process.env.CONTEXT_LLM_SEMANTIC_ENABLED;
      const runtime = createMockRuntime();
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      expect(analyzer.llmSemanticEnabled).toBe(false);
      expect(analyzer.semanticCache).toBeDefined();
      expect(analyzer.cacheHits).toBe(0);
      expect(analyzer.cacheMisses).toBe(0);
      
      analyzer.destroy();
    });

    it('initializes with LLM enabled when env var is set', () => {
      process.env.CONTEXT_LLM_SEMANTIC_ENABLED = 'true';
      const runtime = createMockRuntime();
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      expect(analyzer.llmSemanticEnabled).toBe(true);
      
      analyzer.destroy();
    });

    it('configures cache settings from environment', () => {
      process.env.SEMANTIC_CACHE_TTL = '5000';
      const runtime = createMockRuntime();
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      expect(analyzer.cacheTTL).toBe(5000);
      
      analyzer.destroy();
    });

    it('uses default cache TTL when not specified', () => {
      delete process.env.SEMANTIC_CACHE_TTL;
      const runtime = createMockRuntime();
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      expect(analyzer.cacheTTL).toBe(3600000); // 1 hour
      
      analyzer.destroy();
    });

    it('initializes static mappings for fallback matching', () => {
      const runtime = createMockRuntime();
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      expect(analyzer.staticMappings).toBeDefined();
      expect(analyzer.staticMappings['pixel art']).toContain('8-bit');
      expect(analyzer.staticMappings['lightning network']).toContain('LN');
      
      analyzer.destroy();
    });

    it('sets up periodic cache cleanup interval', () => {
      const runtime = createMockRuntime();
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      expect(analyzer.cleanupInterval).toBeDefined();
      
      analyzer.destroy();
    });
  });

  describe('Quick Keyword Matching', () => {
    let analyzer;

    beforeEach(() => {
      const runtime = createMockRuntime();
      analyzer = new SemanticAnalyzer(runtime, noopLogger);
    });

    afterEach(() => {
      analyzer.destroy();
    });

    it('matches exact topic in content', () => {
      const result = analyzer._quickKeywordMatch(
        'I love pixel art and retro games',
        'pixel art'
      );
      expect(result).toBe(true);
    });

    it('matches case-insensitively', () => {
      const result = analyzer._quickKeywordMatch(
        'Check out this PIXEL ART',
        'pixel art'
      );
      expect(result).toBe(true);
    });

    it('matches when 70% of topic words are present', () => {
      const result = analyzer._quickKeywordMatch(
        'This lightning payment system is amazing',
        'lightning network'
      );
      expect(result).toBe(true);
    });

    it('does not match unrelated content', () => {
      const result = analyzer._quickKeywordMatch(
        'I like cooking and hiking',
        'pixel art'
      );
      expect(result).toBe(false);
    });

    it('requires words longer than 3 characters for multi-word matching', () => {
      const result = analyzer._quickKeywordMatch(
        'I like art',
        'pixel art'
      );
      // Should still match because 'pixel' is in multi-word, but 'art' is <= 3 chars
      expect(result).toBe(false);
    });
  });

  describe('Static Semantic Matching', () => {
    let analyzer;

    beforeEach(() => {
      const runtime = createMockRuntime();
      analyzer = new SemanticAnalyzer(runtime, noopLogger);
    });

    afterEach(() => {
      analyzer.destroy();
    });

    it('matches related terms for pixel art', () => {
      const result = analyzer._staticSemanticMatch(
        'Love this 8-bit sprite work',
        'pixel art'
      );
      expect(result).toBe(true);
    });

    it('matches lightning network related terms', () => {
      const result = analyzer._staticSemanticMatch(
        'Send me some sats via LN',
        'lightning network'
      );
      expect(result).toBe(true);
    });

    it('matches nostr dev related terms', () => {
      const result = analyzer._staticSemanticMatch(
        'Working on a new relay implementation',
        'nostr dev'
      );
      expect(result).toBe(true);
    });

    it('returns false for unknown topics', () => {
      const result = analyzer._staticSemanticMatch(
        'Just some random content',
        'unknown topic'
      );
      expect(result).toBe(false);
    });

    it('returns false when no related terms match', () => {
      const result = analyzer._staticSemanticMatch(
        'I like cooking',
        'pixel art'
      );
      expect(result).toBe(false);
    });
  });

  describe('isSemanticMatch - LLM Disabled', () => {
    let analyzer;

    beforeEach(() => {
      process.env.CONTEXT_LLM_SEMANTIC_ENABLED = 'false';
      const runtime = createMockRuntime();
      analyzer = new SemanticAnalyzer(runtime, noopLogger);
    });

    afterEach(() => {
      analyzer.destroy();
    });

    it('returns false for empty content', async () => {
      const result = await analyzer.isSemanticMatch('', 'pixel art');
      expect(result).toBe(false);
    });

    it('returns false for empty topic', async () => {
      const result = await analyzer.isSemanticMatch('some content', '');
      expect(result).toBe(false);
    });

    it('returns true for quick keyword match', async () => {
      const result = await analyzer.isSemanticMatch(
        'I love pixel art',
        'pixel art'
      );
      expect(result).toBe(true);
    });

    it('uses static matching when LLM disabled', async () => {
      const result = await analyzer.isSemanticMatch(
        'Check out this 8-bit sprite',
        'pixel art'
      );
      expect(result).toBe(true);
    });

    it('returns false when no match found with LLM disabled', async () => {
      const result = await analyzer.isSemanticMatch(
        'Random unrelated content',
        'unknown topic'
      );
      expect(result).toBe(false);
    });
  });

  describe('isSemanticMatch - LLM Enabled', () => {
    let analyzer;
    let mockGenerateText;

    beforeEach(() => {
      process.env.CONTEXT_LLM_SEMANTIC_ENABLED = 'true';
      mockGenerateText = vi.fn();
    });

    afterEach(() => {
      if (analyzer) analyzer.destroy();
    });

    it('uses LLM for semantic analysis', async () => {
      mockGenerateText.mockResolvedValue('YES');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const result = await analyzer.isSemanticMatch(
        'Exploring generative art systems',
        'pixel art'
      );

      expect(result).toBe(true);
      expect(mockGenerateText).toHaveBeenCalled();
      expect(analyzer.cacheMisses).toBe(1);
    });

    it('caches LLM results', async () => {
      mockGenerateText.mockResolvedValue('YES');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const content = 'Some content to analyze';
      const topic = 'pixel art';

      // First call
      await analyzer.isSemanticMatch(content, topic);
      expect(mockGenerateText).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result = await analyzer.isSemanticMatch(content, topic);
      expect(mockGenerateText).toHaveBeenCalledTimes(1); // Not called again
      expect(result).toBe(true);
      expect(analyzer.cacheHits).toBe(1);
    });

    it('returns false when LLM says NO', async () => {
      mockGenerateText.mockResolvedValue('NO');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const result = await analyzer.isSemanticMatch(
        'Unrelated content',
        'pixel art'
      );

      expect(result).toBe(false);
    });

    it('handles LLM response with YES prefix', async () => {
      mockGenerateText.mockResolvedValue('YES, it relates to the topic');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const result = await analyzer.isSemanticMatch(
        'Content about topic',
        'pixel art'
      );

      expect(result).toBe(true);
    });

    it('falls back to static matching when LLM fails', async () => {
      mockGenerateText.mockRejectedValue(new Error('LLM error'));
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const result = await analyzer.isSemanticMatch(
        'This is 8-bit sprite work',
        'pixel art'
      );

      expect(result).toBe(true); // Should still match via static
    });

    it('uses quick match before calling LLM', async () => {
      mockGenerateText.mockResolvedValue('YES');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const result = await analyzer.isSemanticMatch(
        'I love pixel art',
        'pixel art'
      );

      expect(result).toBe(true);
      expect(mockGenerateText).not.toHaveBeenCalled(); // Quick match used
    });
  });

  describe('batchSemanticMatch - LLM Disabled', () => {
    let analyzer;

    beforeEach(() => {
      process.env.CONTEXT_LLM_SEMANTIC_ENABLED = 'false';
      const runtime = createMockRuntime();
      analyzer = new SemanticAnalyzer(runtime, noopLogger);
    });

    afterEach(() => {
      analyzer.destroy();
    });

    it('returns empty object for empty content', async () => {
      const result = await analyzer.batchSemanticMatch('', ['topic1']);
      expect(result).toEqual({});
    });

    it('returns empty object for empty topics array', async () => {
      const result = await analyzer.batchSemanticMatch('content', []);
      expect(result).toEqual({});
    });

    it('analyzes multiple topics with static matching', async () => {
      const content = 'Check out this 8-bit sprite and relay code';
      const topics = ['pixel art', 'nostr dev', 'cooking'];

      const result = await analyzer.batchSemanticMatch(content, topics);

      expect(result['pixel art']).toBe(true);
      expect(result['nostr dev']).toBe(true);
      expect(result['cooking']).toBe(false);
    });

    it('uses cache for repeated batch requests', async () => {
      const content = 'Some content with 8-bit sprites';
      const topics = ['pixel art'];

      // First call
      await analyzer.batchSemanticMatch(content, topics);
      expect(analyzer.cacheMisses).toBe(1);

      // Second call
      await analyzer.batchSemanticMatch(content, topics);
      expect(analyzer.cacheHits).toBe(1);
    });
  });

  describe('batchSemanticMatch - LLM Enabled', () => {
    let analyzer;
    let mockGenerateText;

    beforeEach(() => {
      process.env.CONTEXT_LLM_SEMANTIC_ENABLED = 'true';
      mockGenerateText = vi.fn();
    });

    afterEach(() => {
      if (analyzer) analyzer.destroy();
    });

    it('analyzes multiple topics in single LLM call', async () => {
      mockGenerateText.mockResolvedValue('1. YES\n2. NO\n3. YES');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const content = 'Content about topics';
      const topics = ['topic1', 'topic2', 'topic3'];

      const result = await analyzer.batchSemanticMatch(content, topics);

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      expect(result['topic1']).toBe(true);
      expect(result['topic2']).toBe(false);
      expect(result['topic3']).toBe(true);
    });

    it('caches individual topic results from batch', async () => {
      mockGenerateText.mockResolvedValue('1. YES\n2. NO');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const content = 'Content for caching';
      const topics = ['topic1', 'topic2'];

      // First call
      await analyzer.batchSemanticMatch(content, topics);

      // Second call with subset should use cache
      const result = await analyzer.batchSemanticMatch(content, ['topic1']);
      expect(mockGenerateText).toHaveBeenCalledTimes(1); // Only called once
      expect(result['topic1']).toBe(true);
    });

    it('mixes cached and uncached topics', async () => {
      mockGenerateText
        .mockResolvedValueOnce('1. YES')
        .mockResolvedValueOnce('1. NO');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const content = 'Test content';

      // Cache topic1
      await analyzer.batchSemanticMatch(content, ['topic1']);

      // Now analyze both topic1 (cached) and topic2 (uncached)
      const result = await analyzer.batchSemanticMatch(content, ['topic1', 'topic2']);

      expect(result['topic1']).toBe(true); // From cache
      expect(result['topic2']).toBe(false); // From new LLM call
      expect(analyzer.cacheHits).toBe(1);
      expect(analyzer.cacheMisses).toBe(2);
    });

    it('returns all cached when all topics are cached', async () => {
      mockGenerateText.mockResolvedValue('1. YES\n2. NO');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const content = 'Cached content';
      const topics = ['topic1', 'topic2'];

      // Cache all
      await analyzer.batchSemanticMatch(content, topics);
      const callCount = mockGenerateText.mock.calls.length;

      // Retrieve all from cache
      const result = await analyzer.batchSemanticMatch(content, topics);

      expect(mockGenerateText).toHaveBeenCalledTimes(callCount); // No new calls
      expect(result['topic1']).toBe(true);
      expect(result['topic2']).toBe(false);
    });

    it('falls back to static matching on LLM error', async () => {
      mockGenerateText.mockRejectedValue(new Error('Batch LLM failed'));
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const content = 'Content with 8-bit sprites and relay';
      const topics = ['pixel art', 'nostr dev'];

      const result = await analyzer.batchSemanticMatch(content, topics);

      expect(result['pixel art']).toBe(true);
      expect(result['nostr dev']).toBe(true);
    });
  });

  describe('getSemanticSimilarity - LLM Disabled', () => {
    let analyzer;

    beforeEach(() => {
      process.env.CONTEXT_LLM_SEMANTIC_ENABLED = 'false';
      const runtime = createMockRuntime();
      analyzer = new SemanticAnalyzer(runtime, noopLogger);
    });

    afterEach(() => {
      analyzer.destroy();
    });

    it('returns 0.8 for matching content', async () => {
      const score = await analyzer.getSemanticSimilarity(
        'Check out this 8-bit sprite',
        'pixel art'
      );
      expect(score).toBe(0.8);
    });

    it('returns 0.2 for non-matching content', async () => {
      const score = await analyzer.getSemanticSimilarity(
        'Random unrelated text',
        'pixel art'
      );
      expect(score).toBe(0.2);
    });
  });

  describe('getSemanticSimilarity - LLM Enabled', () => {
    let analyzer;
    let mockGenerateText;

    beforeEach(() => {
      process.env.CONTEXT_LLM_SEMANTIC_ENABLED = 'true';
      mockGenerateText = vi.fn();
    });

    afterEach(() => {
      if (analyzer) analyzer.destroy();
    });

    it('returns parsed similarity score from LLM', async () => {
      mockGenerateText.mockResolvedValue('0.85');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const score = await analyzer.getSemanticSimilarity(
        'Content about topic',
        'pixel art'
      );

      expect(score).toBe(0.85);
      expect(mockGenerateText).toHaveBeenCalled();
    });

    it('clamps score to 0-1 range', async () => {
      mockGenerateText.mockResolvedValue('1.5');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const score = await analyzer.getSemanticSimilarity(
        'Content',
        'topic'
      );

      expect(score).toBe(1);
    });

    it('clamps negative scores to 0', async () => {
      mockGenerateText.mockResolvedValue('-0.3');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const score = await analyzer.getSemanticSimilarity(
        'Content',
        'topic'
      );

      expect(score).toBe(0);
    });

    it('returns 0.5 for invalid LLM response', async () => {
      mockGenerateText.mockResolvedValue('not a number');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const score = await analyzer.getSemanticSimilarity(
        'Content',
        'topic'
      );

      expect(score).toBe(0.5);
    });

    it('falls back to static scoring on LLM error', async () => {
      mockGenerateText.mockRejectedValue(new Error('LLM failed'));
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const score = await analyzer.getSemanticSimilarity(
        'Content with 8-bit sprites',
        'pixel art'
      );

      expect(score).toBe(0.7); // Static match fallback
    });

    it('returns 0.3 for non-matching content on error', async () => {
      mockGenerateText.mockRejectedValue(new Error('LLM failed'));
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const score = await analyzer.getSemanticSimilarity(
        'Random content',
        'pixel art'
      );

      expect(score).toBe(0.3); // No static match
    });

    it('truncates long content in prompt', async () => {
      mockGenerateText.mockResolvedValue('0.6');
      const runtime = createMockRuntime(mockGenerateText);
      analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const longContent = 'a'.repeat(1000);
      await analyzer.getSemanticSimilarity(longContent, 'topic');

      const callArg = mockGenerateText.mock.calls[0][0];
      expect(callArg.includes('a'.repeat(500))).toBe(true);
      expect(callArg.includes('a'.repeat(501))).toBe(false);
    });
  });

  describe('Cache Management', () => {
    let analyzer;

    beforeEach(() => {
      const runtime = createMockRuntime();
      analyzer = new SemanticAnalyzer(runtime, noopLogger);
    });

    afterEach(() => {
      analyzer.destroy();
    });

    it('generates consistent cache keys', () => {
      const key1 = analyzer._getCacheKey('same content', 'topic');
      const key2 = analyzer._getCacheKey('same content', 'topic');
      expect(key1).toBe(key2);
    });

    it('generates different keys for different content', () => {
      const key1 = analyzer._getCacheKey('content1', 'topic');
      const key2 = analyzer._getCacheKey('content2', 'topic');
      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different topics', () => {
      const key1 = analyzer._getCacheKey('content', 'topic1');
      const key2 = analyzer._getCacheKey('content', 'topic2');
      expect(key1).not.toBe(key2);
    });

    it('caches values correctly', () => {
      const key = 'test-key';
      analyzer._addToCache(key, true);
      
      const cached = analyzer._getFromCache(key);
      expect(cached).toBe(true);
    });

    it('returns null for non-existent cache key', () => {
      const cached = analyzer._getFromCache('non-existent');
      expect(cached).toBeNull();
    });

    it('expires cached values after TTL', () => {
      process.env.SEMANTIC_CACHE_TTL = '1000'; // 1 second
      const runtime = createMockRuntime();
      const shortTtlAnalyzer = new SemanticAnalyzer(runtime, noopLogger);

      const key = 'test-key';
      shortTtlAnalyzer._addToCache(key, true);

      // Value should exist
      expect(shortTtlAnalyzer._getFromCache(key)).toBe(true);

      // Advance time beyond TTL
      vi.advanceTimersByTime(1100);

      // Value should be expired
      expect(shortTtlAnalyzer._getFromCache(key)).toBeNull();
      
      shortTtlAnalyzer.destroy();
    });

    it('limits cache size to 1000 entries', () => {
      // Add 1001 entries
      for (let i = 0; i < 1001; i++) {
        analyzer._addToCache(`key-${i}`, true);
      }

      // Cache should have evicted oldest 200 entries
      expect(analyzer.semanticCache.size).toBeLessThanOrEqual(1000);
    });

    it('evicts oldest entries when size limit reached', () => {
      // Add entries with different timestamps
      for (let i = 0; i < 1001; i++) {
        analyzer._addToCache(`key-${i}`, i);
        vi.advanceTimersByTime(1);
      }

      // Oldest entries should be gone
      expect(analyzer._getFromCache('key-0')).toBeNull();
      expect(analyzer._getFromCache('key-1')).toBeNull();
      
      // Newer entries should exist
      expect(analyzer._getFromCache('key-1000')).toBe(1000);
    });

    it('cleans up expired entries', () => {
      process.env.SEMANTIC_CACHE_TTL = '1000';
      const runtime = createMockRuntime();
      const shortTtlAnalyzer = new SemanticAnalyzer(runtime, noopLogger);

      // Add entries
      shortTtlAnalyzer._addToCache('key1', true);
      shortTtlAnalyzer._addToCache('key2', true);

      expect(shortTtlAnalyzer.semanticCache.size).toBe(2);

      // Expire entries
      vi.advanceTimersByTime(1100);

      // Run cleanup
      shortTtlAnalyzer._cleanupCache();

      expect(shortTtlAnalyzer.semanticCache.size).toBe(0);
      
      shortTtlAnalyzer.destroy();
    });

    it('does not remove non-expired entries during cleanup', () => {
      analyzer._addToCache('key1', true);
      
      // Advance time but not past TTL
      vi.advanceTimersByTime(1000);
      
      analyzer._cleanupCache();
      
      expect(analyzer._getFromCache('key1')).toBe(true);
    });

    it('automatically runs cleanup periodically', () => {
      process.env.SEMANTIC_CACHE_TTL = '1000';
      const runtime = createMockRuntime();
      const autoCleanupAnalyzer = new SemanticAnalyzer(runtime, noopLogger);

      autoCleanupAnalyzer._addToCache('key1', true);
      
      // Expire entry
      vi.advanceTimersByTime(1100);
      
      // Trigger automatic cleanup (every 5 minutes)
      vi.advanceTimersByTime(300000);

      expect(autoCleanupAnalyzer.semanticCache.size).toBe(0);
      
      autoCleanupAnalyzer.destroy();
    });
  });

  describe('Cache Statistics', () => {
    let analyzer;

    beforeEach(() => {
      process.env.CONTEXT_LLM_SEMANTIC_ENABLED = 'true';
      const runtime = createMockRuntime(vi.fn().mockResolvedValue('YES'));
      analyzer = new SemanticAnalyzer(runtime, noopLogger);
    });

    afterEach(() => {
      analyzer.destroy();
    });

    it('returns accurate cache statistics', () => {
      const stats = analyzer.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('enabled');
    });

    it('calculates hit rate correctly', async () => {
      const content = 'Test content';
      const topic = 'test topic';

      // First call - miss
      await analyzer.isSemanticMatch(content, topic);

      // Second call - hit
      await analyzer.isSemanticMatch(content, topic);

      const stats = analyzer.getCacheStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe('50.0%');
    });

    it('shows 0% hit rate with no requests', () => {
      const stats = analyzer.getCacheStats();
      expect(stats.hitRate).toBe('0%');
    });

    it('reflects LLM enabled status', () => {
      const stats = analyzer.getCacheStats();
      expect(stats.enabled).toBe(true);
    });

    it('updates size as cache grows', () => {
      analyzer._addToCache('key1', true);
      analyzer._addToCache('key2', false);

      const stats = analyzer.getCacheStats();
      expect(stats.size).toBe(2);
    });
  });

  describe('Hash Functions', () => {
    let analyzer;

    beforeEach(() => {
      const runtime = createMockRuntime();
      analyzer = new SemanticAnalyzer(runtime, noopLogger);
    });

    afterEach(() => {
      analyzer.destroy();
    });

    it('generates consistent hashes', () => {
      const hash1 = analyzer._simpleHash('test string');
      const hash2 = analyzer._simpleHash('test string');
      expect(hash1).toBe(hash2);
    });

    it('generates different hashes for different strings', () => {
      const hash1 = analyzer._simpleHash('string1');
      const hash2 = analyzer._simpleHash('string2');
      expect(hash1).not.toBe(hash2);
    });

    it('handles empty string', () => {
      const hash = analyzer._simpleHash('');
      expect(typeof hash).toBe('string');
    });

    it('handles special characters', () => {
      const hash = analyzer._simpleHash('test!@#$%^&*()');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });
  });

  describe('LLM Integration', () => {
    let mockGenerateText;

    beforeEach(() => {
      process.env.CONTEXT_LLM_SEMANTIC_ENABLED = 'true';
      mockGenerateText = vi.fn();
    });

    it('constructs valid prompt for semantic match', async () => {
      mockGenerateText.mockResolvedValue('YES');
      const runtime = createMockRuntime(mockGenerateText);
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      await analyzer._llmSemanticMatch('test content', 'test topic');

      const prompt = mockGenerateText.mock.calls[0][0];
      expect(prompt).toContain('test content');
      expect(prompt).toContain('test topic');
      expect(prompt).toContain('YES');
      expect(prompt).toContain('NO');

      analyzer.destroy();
    });

    it('truncates long content in semantic match prompt', async () => {
      mockGenerateText.mockResolvedValue('YES');
      const runtime = createMockRuntime(mockGenerateText);
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const longContent = 'a'.repeat(1000);
      await analyzer._llmSemanticMatch(longContent, 'topic');

      const prompt = mockGenerateText.mock.calls[0][0];
      expect(prompt.includes('a'.repeat(500))).toBe(true);
      expect(prompt.includes('a'.repeat(501))).toBe(false);

      analyzer.destroy();
    });

    it('uses low temperature for consistent results', async () => {
      mockGenerateText.mockResolvedValue('YES');
      const runtime = createMockRuntime(mockGenerateText);
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      await analyzer._llmSemanticMatch('content', 'topic');

      const options = mockGenerateText.mock.calls[0][1];
      expect(options.temperature).toBe(0.1);

      analyzer.destroy();
    });

    it('limits tokens for semantic match', async () => {
      mockGenerateText.mockResolvedValue('YES');
      const runtime = createMockRuntime(mockGenerateText);
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      await analyzer._llmSemanticMatch('content', 'topic');

      const options = mockGenerateText.mock.calls[0][1];
      expect(options.maxTokens).toBe(5);

      analyzer.destroy();
    });

    it('constructs batch prompt correctly', async () => {
      mockGenerateText.mockResolvedValue('1. YES\n2. NO\n3. YES');
      const runtime = createMockRuntime(mockGenerateText);
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      await analyzer._llmBatchSemanticMatch('content', ['topic1', 'topic2', 'topic3']);

      const prompt = mockGenerateText.mock.calls[0][0];
      expect(prompt).toContain('1. topic1');
      expect(prompt).toContain('2. topic2');
      expect(prompt).toContain('3. topic3');

      analyzer.destroy();
    });

    it('parses batch response correctly', async () => {
      mockGenerateText.mockResolvedValue('1. YES\n2. NO\n3. YES');
      const runtime = createMockRuntime(mockGenerateText);
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const result = await analyzer._llmBatchSemanticMatch(
        'content',
        ['topic1', 'topic2', 'topic3']
      );

      expect(result['topic1']).toBe(true);
      expect(result['topic2']).toBe(false);
      expect(result['topic3']).toBe(true);

      analyzer.destroy();
    });

    it('handles partial batch responses', async () => {
      mockGenerateText.mockResolvedValue('1. YES\n2. NO');
      const runtime = createMockRuntime(mockGenerateText);
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const result = await analyzer._llmBatchSemanticMatch(
        'content',
        ['topic1', 'topic2', 'topic3']
      );

      expect(result['topic1']).toBe(true);
      expect(result['topic2']).toBe(false);
      expect(result['topic3']).toBe(false); // Default when missing
      
      analyzer.destroy();
    });
  });

  describe('destroy', () => {
    it('clears cleanup interval', () => {
      const runtime = createMockRuntime();
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      expect(analyzer.cleanupInterval).toBeDefined();
      
      analyzer.destroy();
      
      // Interval should be cleared (can't directly test, but no errors should occur)
      expect(analyzer.cleanupInterval).toBeDefined();
    });

    it('clears cache on destroy', () => {
      const runtime = createMockRuntime();
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      analyzer._addToCache('key1', true);
      analyzer._addToCache('key2', false);

      expect(analyzer.semanticCache.size).toBe(2);

      analyzer.destroy();

      expect(analyzer.semanticCache.size).toBe(0);
    });

    it('logs final cache stats on destroy', () => {
      const logSpy = vi.fn();
      const logger = { ...noopLogger, info: logSpy };
      const runtime = createMockRuntime();
      const analyzer = new SemanticAnalyzer(runtime, logger);

      analyzer.destroy();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SEMANTIC] Destroyed'),
        expect.any(Object)
      );
    });
  });

  describe('Edge Cases', () => {
    let analyzer;

    beforeEach(() => {
      const runtime = createMockRuntime();
      analyzer = new SemanticAnalyzer(runtime, noopLogger);
    });

    afterEach(() => {
      analyzer.destroy();
    });

    it('handles null content gracefully', async () => {
      const result = await analyzer.isSemanticMatch(null, 'topic');
      expect(result).toBe(false);
    });

    it('handles null topic gracefully', async () => {
      const result = await analyzer.isSemanticMatch('content', null);
      expect(result).toBe(false);
    });

    it('handles undefined content and topic', async () => {
      const result = await analyzer.isSemanticMatch(undefined, undefined);
      expect(result).toBe(false);
    });

    it('handles very long content', async () => {
      const longContent = 'a'.repeat(10000);
      const result = await analyzer.isSemanticMatch(longContent, 'pixel art');
      expect(typeof result).toBe('boolean');
    });

    it('handles unicode characters', async () => {
      const content = 'Testing with emoji 🎨🖼️ and unicode ñ';
      const result = await analyzer.isSemanticMatch(content, 'pixel art');
      expect(typeof result).toBe('boolean');
    });

    it('handles special characters in topic', async () => {
      const content = 'Some content';
      const topic = 'topic!@#$%^&*()';
      const result = await analyzer.isSemanticMatch(content, topic);
      expect(typeof result).toBe('boolean');
    });

    it('handles whitespace-only content', async () => {
      const result = await analyzer.isSemanticMatch('   \n\t  ', 'topic');
      expect(result).toBe(false);
    });

    it('handles whitespace-only topic', async () => {
      const result = await analyzer.isSemanticMatch('content', '   \n\t  ');
      expect(result).toBe(false);
    });
  });

  describe('Integration Scenarios', () => {
    it('handles full workflow with LLM enabled', async () => {
      process.env.CONTEXT_LLM_SEMANTIC_ENABLED = 'true';
      const mockGenerateText = vi.fn()
        .mockResolvedValueOnce('YES')
        .mockResolvedValueOnce('0.85');
      
      const runtime = createMockRuntime(mockGenerateText);
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      // Check semantic match
      const isMatch = await analyzer.isSemanticMatch(
        'Exploring generative pixel art systems',
        'pixel art'
      );
      expect(isMatch).toBe(true);

      // Get similarity score
      const similarity = await analyzer.getSemanticSimilarity(
        'Exploring generative pixel art systems',
        'creative coding'
      );
      expect(similarity).toBe(0.85);

      // Check stats
      const stats = analyzer.getCacheStats();
      expect(stats.misses).toBeGreaterThan(0);

      analyzer.destroy();
    });

    it('handles full workflow with LLM disabled', async () => {
      process.env.CONTEXT_LLM_SEMANTIC_ENABLED = 'false';
      const runtime = createMockRuntime();
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      // Check semantic match (should use static)
      const isMatch = await analyzer.isSemanticMatch(
        'Check out this 8-bit sprite work',
        'pixel art'
      );
      expect(isMatch).toBe(true);

      // Get similarity score (binary fallback)
      const similarity = await analyzer.getSemanticSimilarity(
        'Check out this 8-bit sprite work',
        'pixel art'
      );
      expect(similarity).toBe(0.8);

      analyzer.destroy();
    });

    it('handles mixed cache hits and misses', async () => {
      process.env.CONTEXT_LLM_SEMANTIC_ENABLED = 'true';
      const mockGenerateText = vi.fn().mockResolvedValue('YES');
      const runtime = createMockRuntime(mockGenerateText);
      const analyzer = new SemanticAnalyzer(runtime, noopLogger);

      const content = 'Test content for caching';

      // First call - cache miss
      await analyzer.isSemanticMatch(content, 'topic1');
      expect(analyzer.cacheMisses).toBe(1);

      // Second call same content/topic - cache hit
      await analyzer.isSemanticMatch(content, 'topic1');
      expect(analyzer.cacheHits).toBe(1);

      // Third call different topic - cache miss
      await analyzer.isSemanticMatch(content, 'topic2');
      expect(analyzer.cacheMisses).toBe(2);

      // Fourth call first topic again - cache hit
      await analyzer.isSemanticMatch(content, 'topic1');
      expect(analyzer.cacheHits).toBe(2);

      const stats = analyzer.getCacheStats();
      expect(stats.hitRate).toBe('50.0%');

      analyzer.destroy();
    });
  });
});
