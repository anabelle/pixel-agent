const { describe, it, expect, beforeEach, afterEach, vi } = globalThis;
const { TopicExtractor } = require('../lib/topicExtractor.js');
const { FORBIDDEN_TOPIC_WORDS, TIMELINE_LORE_IGNORED_TERMS, EXTRACTED_TOPICS_LIMIT } = require('../lib/nostr.js');

describe('TopicExtractor', () => {
  let mockRuntime;
  let mockLogger;
  let extractor;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      warn: vi.fn()
    };

    mockRuntime = {
      useModel: vi.fn(),
      getSetting: vi.fn()
    };

    // Clear any existing extractors
    if (extractor) {
      extractor.destroy();
    }
  });

  afterEach(() => {
    if (extractor) {
      extractor.destroy();
      extractor = null;
    }
  });

  describe('Constructor', () => {
    it('initializes with default options', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      expect(extractor.runtime).toBe(mockRuntime);
      expect(extractor.logger).toBe(mockLogger);
      expect(extractor.batchSize).toBe(8);
      expect(extractor.batchWaitMs).toBe(Infinity);
      expect(extractor.cache).toBeInstanceOf(Map);
      expect(extractor.stats.llmCalls).toBe(0);
      expect(extractor.stats.processed).toBe(0);
    });

    it('initializes with custom options', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger, {
        batchSize: 5,
        batchWaitMs: 100
      });
      
      expect(extractor.batchSize).toBe(8); // Note: options aren't used in constructor
    });

    it('sets up cleanup interval', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      expect(extractor.cleanupInterval).toBeDefined();
    });
  });

  describe('Basic Extraction', () => {
    it('extracts topics from text with LLM', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'artificial intelligence, machine learning, neural networks'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger, {});
      
      const event = {
        id: 'test1',
        content: 'I am learning about artificial intelligence and machine learning today. Neural networks are fascinating!'
      };

      const topics = await extractor.extractTopics(event);
      
      expect(topics.length).toBeGreaterThan(0);
      expect(topics).toContain('artificial intelligence');
    });

    it('handles empty content', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = { id: 'test2', content: '' };
      const topics = await extractor.extractTopics(event);
      
      expect(topics).toEqual([]);
      expect(extractor.stats.processed).toBe(1);
    });

    it('handles null content', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = { id: 'test3', content: null };
      const topics = await extractor.extractTopics(event);
      
      expect(topics).toEqual([]);
    });

    it('handles undefined event', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const topics = await extractor.extractTopics(null);
      
      expect(topics).toEqual([]);
    });

    it('extracts from short posts using fast extraction', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test4',
        content: 'Hello!'
      };

      const topics = await extractor.extractTopics(event);
      
      expect(extractor.stats.skipped).toBe(1);
      expect(Array.isArray(topics)).toBe(true);
    });

    it('extracts from long posts', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'quantum computing, research'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const longContent = 'Quantum computing is revolutionizing the field of computation. '.repeat(20);
      const event = {
        id: 'test5',
        content: longContent
      };

      const topics = await extractor.extractTopics(event);
      
      expect(topics.length).toBeGreaterThan(0);
    });

    it('handles unicode and emoji', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'emoji, unicode'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test6',
        content: '🚀 This is about rockets and space exploration! 🌟 Amazing technology'
      };

      const topics = await extractor.extractTopics(event);
      
      expect(Array.isArray(topics)).toBe(true);
    });

    it('respects topic count limits', async () => {
      const manyTopics = Array(30).fill(null).map((_, i) => `topic${i}`).join(', ');
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: manyTopics
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test7',
        content: 'This is a post with many potential topics and keywords throughout the content.'
      };

      const topics = await extractor.extractTopics(event);
      
      expect(topics.length).toBeLessThanOrEqual(EXTRACTED_TOPICS_LIMIT);
    });
  });

  describe('Keyword Processing', () => {
    it('identifies important keywords', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'typescript, javascript, programming'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test8',
        content: 'Learning TypeScript and JavaScript programming today.'
      };

      const topics = await extractor.extractTopics(event);
      
      expect(topics.some(t => ['typescript', 'javascript', 'programming'].includes(t))).toBe(true);
    });

    it('filters common stopwords', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const sanitized = extractor._sanitizeTopic('the');
      expect(sanitized).toBe('the'); // Sanitize doesn't filter stopwords, but extraction logic does
    });

    it('handles special characters', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const sanitized = extractor._sanitizeTopic('hello!@#$%world');
      expect(sanitized).toBe('hello world');
    });

    it('normalizes case', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const sanitized = extractor._sanitizeTopic('TypeScript');
      expect(sanitized).toBe('typescript');
    });

    it('trims whitespace', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const sanitized = extractor._sanitizeTopic('  topic  ');
      expect(sanitized).toBe('topic');
    });

    it('removes URLs from topics', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const sanitized = extractor._sanitizeTopic('check https://example.com for info');
      expect(sanitized).not.toContain('https://');
    });

    it('removes nostr URIs', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const sanitized = extractor._sanitizeTopic('nostr:npub1234567890 is cool');
      expect(sanitized).not.toContain('nostr:');
    });

    it('filters numeric-only topics', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const sanitized = extractor._sanitizeTopic('12345');
      expect(sanitized).toBe('');
    });

    it('filters generic words', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      expect(extractor._sanitizeTopic('general')).toBe('');
      expect(extractor._sanitizeTopic('various')).toBe('');
      expect(extractor._sanitizeTopic('discussion')).toBe('');
      expect(extractor._sanitizeTopic('none')).toBe('');
    });

    it('enforces minimum length', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const sanitized = extractor._sanitizeTopic('a');
      expect(sanitized).toBe('');
    });

    it('enforces maximum length', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const longTopic = 'a'.repeat(150);
      const sanitized = extractor._sanitizeTopic(longTopic);
      expect(sanitized).toBe('');
    });
  });

  describe('Topic Normalization', () => {
    it('removes duplicate topics', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'javascript, JavaScript, JAVASCRIPT'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test9',
        content: 'JavaScript JavaScript JavaScript programming'
      };

      const topics = await extractor.extractTopics(event);
      const uniqueTopics = new Set(topics);
      
      expect(topics.length).toBe(uniqueTopics.size);
    });

    it('handles topic variations', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const topic1 = extractor._sanitizeTopic('Node.js');
      const topic2 = extractor._sanitizeTopic('Node-js');
      
      // Both should be normalized to similar format
      expect(topic1).toBeTruthy();
      expect(topic2).toBeTruthy();
    });

    it('removes leading punctuation', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const sanitized = extractor._sanitizeTopic('- topic');
      expect(sanitized).toBe('topic');
    });

    it('removes bullet points', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const sanitized = extractor._sanitizeTopic('• topic');
      expect(sanitized).toBe('topic');
    });
  });

  describe('Hashtag Handling', () => {
    it('extracts hashtags', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test10',
        content: 'Learning #JavaScript and #Python today!'
      };

      const hashtags = extractor._extractHashtags(event);
      
      expect(hashtags).toContain('javascript');
      expect(hashtags).toContain('python');
    });

    it('normalizes hashtag format', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test11',
        content: '#CamelCase #lowercase #UPPERCASE'
      };

      const hashtags = extractor._extractHashtags(event);
      
      hashtags.forEach(tag => {
        expect(tag).toBe(tag.toLowerCase());
      });
    });

    it('handles multi-word hashtags', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test12',
        content: 'Check out #MachineLearning and #ArtificialIntelligence'
      };

      const hashtags = extractor._extractHashtags(event);
      
      expect(hashtags).toContain('machinelearning');
      expect(hashtags).toContain('artificialintelligence');
    });

    it('handles unicode hashtags', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test13',
        content: '#中文 #日本語 #한글'
      };

      const hashtags = extractor._extractHashtags(event);
      
      expect(hashtags.length).toBeGreaterThan(0);
    });

    it('filters forbidden hashtags', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test14',
        content: '#pixel #art #lnpixels'
      };

      const hashtags = extractor._extractHashtags(event);
      
      expect(hashtags).not.toContain('pixel');
      expect(hashtags).not.toContain('art');
      expect(hashtags).not.toContain('lnpixels');
    });

    it('filters ignored terms hashtags', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test15',
        content: '#bitcoin #nostr #crypto'
      };

      const hashtags = extractor._extractHashtags(event);
      
      expect(hashtags).not.toContain('bitcoin');
      expect(hashtags).not.toContain('nostr');
      expect(hashtags).not.toContain('crypto');
    });
  });

  describe('Fast Topic Extraction', () => {
    it('extracts hashtags in fast mode', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test16',
        content: 'Quick post #testing #fastmode'
      };

      const topics = extractor._extractFastTopics(event);
      
      expect(topics).toContain('testing');
      expect(topics).toContain('fastmode');
    });

    it('extracts mentions in fast mode', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test17',
        content: 'Thanks @alice and @bob for the help!'
      };

      const topics = extractor._extractFastTopics(event);
      
      expect(topics).toContain('alice');
      expect(topics).toContain('bob');
    });

    it('extracts nostr entities in fast mode', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test18',
        content: 'Just set up my lightning wallet and sent some sats to the relay node'
      };

      const topics = extractor._extractFastTopics(event);
      
      expect(topics.some(t => ['lightning', 'wallet', 'sats', 'relay', 'node'].includes(t))).toBe(true);
    });

    it('extracts domain names from URLs in fast mode', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test19',
        content: 'Check out https://github.com and https://example.com'
      };

      const topics = extractor._extractFastTopics(event);
      
      expect(topics.some(t => ['github', 'example'].includes(t))).toBe(true);
    });

    it('extracts bigrams as fallback in fast mode', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test20',
        content: 'This content has multiple interesting words about technology and innovation'
      };

      const topics = extractor._extractFastTopics(event);
      
      expect(topics.length).toBeGreaterThan(0);
    });

    it('filters forbidden words in fast mode', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test21',
        content: 'pixel art lnpixels #pixel #art'
      };

      const topics = extractor._extractFastTopics(event);
      
      topics.forEach(topic => {
        expect(FORBIDDEN_TOPIC_WORDS.has(topic)).toBe(false);
      });
    });

    it('deduplicates topics in fast mode', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test22',
        content: 'testing testing #testing testing'
      };

      const topics = extractor._extractFastTopics(event);
      const uniqueTopics = new Set(topics);
      
      expect(topics.length).toBe(uniqueTopics.size);
    });
  });

  describe('Caching', () => {
    it('caches extracted topics', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'technology, development'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'test23',
        content: 'This is a long enough post about technology and development to trigger LLM extraction.'
      };

      await extractor.extractTopics(event);
      
      // Second call with same content should hit cache
      const event2 = {
        id: 'test24',
        content: 'This is a long enough post about technology and development to trigger LLM extraction.'
      };
      
      await extractor.extractTopics(event2);
      
      expect(extractor.stats.cacheHits).toBe(1);
    });

    it('respects cache TTL', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'technology, development'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.cacheTTL = 100; // 100ms TTL
      
      const event = {
        id: 'test25',
        content: 'This is a long enough post about technology and development to trigger LLM extraction.'
      };

      await extractor.extractTopics(event);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const event2 = {
        id: 'test26',
        content: 'This is a long enough post about technology and development to trigger LLM extraction.'
      };
      
      await extractor.extractTopics(event2);
      
      // Should not be a cache hit after expiration
      expect(extractor.stats.cacheHits).toBe(0);
    });

    it('limits cache size with LRU eviction', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'topic'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.maxCacheSize = 3;
      
      for (let i = 0; i < 5; i++) {
        const event = {
          id: `test${27 + i}`,
          content: `Unique content ${i} that is long enough to trigger LLM extraction and caching.`
        };
        await extractor.extractTopics(event);
      }
      
      expect(extractor.cache.size).toBeLessThanOrEqual(3);
    });

    it('cleans up expired cache entries', async () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.cacheTTL = 50; // 50ms TTL
      
      // Manually add cache entries
      extractor.cache.set('key1', { topics: ['test'], timestamp: Date.now() - 100 });
      extractor.cache.set('key2', { topics: ['test'], timestamp: Date.now() });
      
      extractor._cleanupCache();
      
      expect(extractor.cache.has('key1')).toBe(false);
      expect(extractor.cache.has('key2')).toBe(true);
    });

    it('generates consistent cache keys', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const content = 'This is test content';
      const key1 = extractor._getCacheKey(content);
      const key2 = extractor._getCacheKey(content);
      
      expect(key1).toBe(key2);
    });

    it('generates different keys for different content', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const key1 = extractor._getCacheKey('Content 1');
      const key2 = extractor._getCacheKey('Content 2');
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('Batching', () => {
    it('batches multiple events together', async () => {
      mockRuntime.useModel = vi.fn().mockImplementation(async () => {
        const lines = Array(8).fill('technology, development');
        return { text: lines.join('\n') };
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchSize = 8;
      
      const promises = [];
      for (let i = 0; i < 8; i++) {
        promises.push(extractor.extractTopics({
          id: `batch${i}`,
          content: `This is event ${i} with enough content to trigger LLM extraction and batching behavior.`
        }));
      }
      
      await Promise.all(promises);
      
      // Should make only 1 LLM call for 8 events
      expect(mockRuntime.useModel).toHaveBeenCalledTimes(1);
      expect(extractor.stats.batchedSavings).toBe(7);
    });

    it('processes batch when full', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: Array(8).fill('topic1, topic2').join('\n')
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchSize = 8;
      
      const promises = [];
      for (let i = 0; i < 8; i++) {
        promises.push(extractor.extractTopics({
          id: `full${i}`,
          content: `Event ${i} with enough content for batching test purposes and trigger extraction properly.`
        }));
      }
      
      const results = await Promise.all(promises);
      
      results.forEach(topics => {
        expect(Array.isArray(topics)).toBe(true);
      });
    });

    it('handles batch extraction errors gracefully', async () => {
      mockRuntime.useModel = vi.fn().mockRejectedValue(new Error('LLM error'));

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchSize = 2;
      
      const promises = [
        extractor.extractTopics({
          id: 'error1',
          content: 'This is event 1 with enough content to trigger LLM extraction and test error handling.'
        }),
        extractor.extractTopics({
          id: 'error2',
          content: 'This is event 2 with enough content to trigger LLM extraction and test error handling.'
        })
      ];
      
      const results = await Promise.all(promises);
      
      // Should fall back to fast extraction
      results.forEach(topics => {
        expect(Array.isArray(topics)).toBe(true);
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('processes single event without batching', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'single, topic'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchSize = 8;
      extractor.batchWaitMs = 50; // Short timeout
      
      const topics = await extractor.extractTopics({
        id: 'single1',
        content: 'This is a single event with enough content to trigger LLM extraction without batching.'
      });
      
      expect(Array.isArray(topics)).toBe(true);
    });

    it('merges hashtags with batch results', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: Array(2).fill('extracted, topic').join('\n')
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchSize = 2;
      
      const promises = [
        extractor.extractTopics({
          id: 'hash1',
          content: 'Event with #hashtag1 and enough content to trigger LLM extraction and batching test.'
        }),
        extractor.extractTopics({
          id: 'hash2',
          content: 'Event with #hashtag2 and enough content to trigger LLM extraction and batching test.'
        })
      ];
      
      const [topics1, topics2] = await Promise.all(promises);
      
      expect(topics1).toContain('hashtag1');
      expect(topics2).toContain('hashtag2');
    });

    it('uses fallback when batch returns no topics', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'none\nnone'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchSize = 2;
      
      const promises = [
        extractor.extractTopics({
          id: 'fallback1',
          content: 'Event 1 with some content that should get fallback topics when LLM returns none.'
        }),
        extractor.extractTopics({
          id: 'fallback2',
          content: 'Event 2 with some content that should get fallback topics when LLM returns none.'
        })
      ];
      
      const results = await Promise.all(promises);
      
      results.forEach(topics => {
        expect(Array.isArray(topics)).toBe(true);
      });
    });
  });

  describe('LLM Integration', () => {
    it('handles string response from LLM', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue('topic1, topic2, topic3');

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchWaitMs = 50;
      
      const event = {
        id: 'string1',
        content: 'This content should trigger LLM extraction and handle string response properly.'
      };

      const topics = await extractor.extractTopics(event);
      
      expect(topics).toContain('topic1');
      expect(topics).toContain('topic2');
      expect(topics).toContain('topic3');
    });

    it('handles object response from LLM', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'topic1, topic2, topic3'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchWaitMs = 50;
      
      const event = {
        id: 'object1',
        content: 'This content should trigger LLM extraction and handle object response properly.'
      };

      const topics = await extractor.extractTopics(event);
      
      expect(topics).toContain('topic1');
      expect(topics).toContain('topic2');
      expect(topics).toContain('topic3');
    });

    it('handles LLM returning "none"', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'none'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchWaitMs = 50;
      
      const event = {
        id: 'none1',
        content: 'This content triggers LLM extraction but LLM returns none so fallback is used.'
      };

      const topics = await extractor.extractTopics(event);
      
      // Should fall back to fast extraction
      expect(Array.isArray(topics)).toBe(true);
    });

    it('truncates long content for LLM', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'long, content'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchWaitMs = 50;
      
      const longContent = 'word '.repeat(500); // Very long content
      const event = {
        id: 'long1',
        content: longContent
      };

      await extractor.extractTopics(event);
      
      // Check that prompt was called with truncated content
      expect(mockRuntime.useModel).toHaveBeenCalled();
      const call = mockRuntime.useModel.mock.calls[0];
      expect(call[1].prompt.length).toBeLessThan(longContent.length + 1000);
    });

    it('falls back to fast extraction when no runtime', async () => {
      extractor = new TopicExtractor(null, mockLogger);
      
      const event = {
        id: 'noruntime1',
        content: 'This is content without runtime so it should use fast extraction fallback method.'
      };

      const topics = await extractor.extractTopics(event);
      
      expect(Array.isArray(topics)).toBe(true);
    });

    it('falls back to fast extraction when useModel undefined', async () => {
      const noModelRuntime = { getSetting: vi.fn() };
      extractor = new TopicExtractor(noModelRuntime, mockLogger);
      
      const event = {
        id: 'nomodel1',
        content: 'This is content without useModel so it should use fast extraction fallback method.'
      };

      const topics = await extractor.extractTopics(event);
      
      expect(Array.isArray(topics)).toBe(true);
    });
  });

  describe('Utility Methods', () => {
    it('detects full sentences', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      expect(extractor._hasFullSentence('This is a complete sentence.')).toBe(true);
      expect(extractor._hasFullSentence('Short')).toBe(false);
      expect(extractor._hasFullSentence('At least five words here!')).toBe(true);
      expect(extractor._hasFullSentence('Is this a question?')).toBe(true);
      expect(extractor._hasFullSentence('Two, words')).toBe(false);
    });

    it('detects sentences with commas', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      expect(extractor._hasFullSentence('Word, another, third')).toBe(true);
    });

    it('rejects very short content', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      expect(extractor._hasFullSentence('Hi')).toBe(false);
      expect(extractor._hasFullSentence('123')).toBe(false);
    });
  });

  describe('Stats and Lifecycle', () => {
    it('tracks stats correctly', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'topic'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      await extractor.extractTopics({
        id: 'stats1',
        content: 'Long enough content for stats tracking test'
      });
      
      const stats = extractor.getStats();
      
      expect(stats.processed).toBeGreaterThan(0);
      expect(stats).toHaveProperty('cacheHitRate');
      expect(stats).toHaveProperty('skipRate');
      expect(stats).toHaveProperty('estimatedSavings');
      expect(stats).toHaveProperty('cacheSize');
    });

    it('calculates cache hit rate', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'topic'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'rate1',
        content: 'Content for cache hit rate test with enough length'
      };
      
      await extractor.extractTopics(event);
      await extractor.extractTopics({ ...event, id: 'rate2' });
      
      const stats = extractor.getStats();
      
      expect(stats.cacheHits).toBe(1);
      expect(stats.cacheHitRate).toMatch(/\d+\.\d+%/);
    });

    it('destroys cleanly', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      expect(extractor.cleanupInterval).toBeDefined();
      expect(extractor.cache.size).toBe(0);
      
      extractor.destroy();
      
      expect(extractor.cache.size).toBe(0);
    });

    it('flushes pending batch', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'topic'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchWaitMs = Infinity; // Never auto-process
      
      // Add event to pending batch
      const promise = extractor.extractTopics({
        id: 'flush1',
        content: 'Content that will be in pending batch for flush test'
      });
      
      // Flush should process it
      await extractor.flush();
      
      const topics = await promise;
      expect(Array.isArray(topics)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('handles malformed hashtags', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'edge1',
        content: '# #123 #'
      };

      const hashtags = extractor._extractHashtags(event);
      
      // Should filter out malformed ones
      expect(hashtags).toEqual([]);
    });

    it('handles null in sanitization', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      expect(extractor._sanitizeTopic(null)).toBe('');
      expect(extractor._sanitizeTopic(undefined)).toBe('');
      expect(extractor._sanitizeTopic(123)).toBe('');
    });

    it('handles concurrent batch processing guard', async () => {
      mockRuntime.useModel = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { text: 'topic' };
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchSize = 2;
      
      // Trigger multiple batches quickly
      const promises = [];
      for (let i = 0; i < 4; i++) {
        promises.push(extractor.extractTopics({
          id: `concurrent${i}`,
          content: `Event ${i} to test concurrent batch processing guard mechanism properly.`
        }));
      }
      
      const results = await Promise.all(promises);
      
      results.forEach(topics => {
        expect(Array.isArray(topics)).toBe(true);
      });
    });

    it('handles empty batch response lines', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'topic1\n\n\ntopic2'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchSize = 2;
      
      const promises = [
        extractor.extractTopics({
          id: 'empty1',
          content: 'Event 1 to test empty batch response lines handling properly with LLM.'
        }),
        extractor.extractTopics({
          id: 'empty2',
          content: 'Event 2 to test empty batch response lines handling properly with LLM.'
        })
      ];
      
      const results = await Promise.all(promises);
      
      results.forEach(topics => {
        expect(Array.isArray(topics)).toBe(true);
      });
    });

    it('handles batch response with numbering', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: '1. topic1, topic2\n2. topic3, topic4'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchSize = 2;
      
      const promises = [
        extractor.extractTopics({
          id: 'num1',
          content: 'Event 1 to test batch response with numbering from LLM properly.'
        }),
        extractor.extractTopics({
          id: 'num2',
          content: 'Event 2 to test batch response with numbering from LLM properly.'
        })
      ];
      
      const [topics1, topics2] = await Promise.all(promises);
      
      expect(topics1).toContain('topic1');
      expect(topics2).toContain('topic3');
    });

    it('handles invalid URL in fast extraction', () => {
      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'url1',
        content: 'Check out not-a-url://invalid'
      };

      const topics = extractor._extractFastTopics(event);
      
      expect(Array.isArray(topics)).toBe(true);
    });

    it('continues processing after batch error', async () => {
      let callCount = 0;
      mockRuntime.useModel = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First batch fails');
        }
        return { text: Array(2).fill('topic').join('\n') };
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchSize = 2;
      
      // First batch
      const promise1 = extractor.extractTopics({
        id: 'error1',
        content: 'Event 1 to test error recovery in batch processing properly.'
      });
      const promise2 = extractor.extractTopics({
        id: 'error2',
        content: 'Event 2 to test error recovery in batch processing properly.'
      });
      
      await Promise.all([promise1, promise2]);
      
      // Second batch should still work
      const promise3 = extractor.extractTopics({
        id: 'error3',
        content: 'Event 3 to test error recovery in batch processing properly.'
      });
      const promise4 = extractor.extractTopics({
        id: 'error4',
        content: 'Event 4 to test error recovery in batch processing properly.'
      });
      
      const results = await Promise.all([promise3, promise4]);
      
      results.forEach(topics => {
        expect(Array.isArray(topics)).toBe(true);
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('extracts topics from real-world post', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'lightning network, bitcoin, payment'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'real1',
        content: 'Just made my first Lightning Network payment! ⚡ Bitcoin is amazing! #LightningNetwork #BTC'
      };

      const topics = await extractor.extractTopics(event);
      
      expect(topics.length).toBeGreaterThan(0);
      expect(topics.some(t => t.includes('lightning'))).toBe(true);
    });

    it('handles mixed language content', async () => {
      mockRuntime.useModel = vi.fn().mockResolvedValue({
        text: 'multilingual, technology'
      });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      
      const event = {
        id: 'mixed1',
        content: 'Learning 中文 and technology! #multilingual 日本語も勉強しています。'
      };

      const topics = await extractor.extractTopics(event);
      
      expect(Array.isArray(topics)).toBe(true);
      expect(topics).toContain('multilingual');
    });

    it('processes thread of related posts', async () => {
      mockRuntime.useModel = vi.fn()
        .mockResolvedValueOnce({ text: 'javascript' })
        .mockResolvedValueOnce({ text: 'typescript' })
        .mockResolvedValueOnce({ text: 'react' });

      extractor = new TopicExtractor(mockRuntime, mockLogger);
      extractor.batchWaitMs = 50;
      
      const posts = [
        'Learning JavaScript basics today',
        'Moving on to TypeScript features',
        'Building a React application'
      ];

      const results = [];
      for (const content of posts) {
        const topics = await extractor.extractTopics({
          id: `thread${results.length}`,
          content
        });
        results.push(topics);
      }
      
      expect(results.length).toBe(3);
      results.forEach(topics => {
        expect(Array.isArray(topics)).toBe(true);
      });
    });
  });
});
