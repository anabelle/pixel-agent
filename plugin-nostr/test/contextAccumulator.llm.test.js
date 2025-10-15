const { describe, it, expect, beforeEach, afterEach } = globalThis;
const { vi } = globalThis;
const { ContextAccumulator } = require('../lib/contextAccumulator');

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn()
};

const createMockRuntime = (options = {}) => {
  return {
    agentId: 'test-agent-123',
    generateText: options.generateText || vi.fn().mockResolvedValue('positive'),
    useModel: options.useModel || vi.fn().mockResolvedValue({ text: 'test topic' }),
    createMemory: options.createMemory || vi.fn().mockResolvedValue({ id: 'mem-123', created: true }),
    getMemories: options.getMemories || vi.fn().mockResolvedValue([]),
    createUniqueUuid: options.createUniqueUuid || ((runtime, prefix) => `${prefix}-${Date.now()}`)
  };
};

const createTestEvent = (overrides = {}) => {
  return {
    id: `evt-${Date.now()}-${Math.random()}`,
    pubkey: overrides.pubkey || 'npub123',
    content: overrides.content || 'Test event content',
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: overrides.tags || [],
    ...overrides
  };
};

describe('ContextAccumulator - LLM Integration', () => {
  let accumulator;
  let mockRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    mockRuntime = createMockRuntime();
    accumulator = new ContextAccumulator(mockRuntime, noopLogger);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('_analyzeSentimentWithLLM', () => {
    it('analyzes sentiment using LLM', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('positive');
      accumulator.llmSentimentEnabled = true;
      
      const sentiment = await accumulator._analyzeSentimentWithLLM('This is amazing!');
      
      expect(sentiment).toBe('positive');
      expect(mockRuntime.generateText).toHaveBeenCalled();
    });

    it('handles LLM response with extra text', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('The sentiment is: positive');
      accumulator.llmSentimentEnabled = true;
      
      const sentiment = await accumulator._analyzeSentimentWithLLM('Great work!');
      
      expect(sentiment).toBe('positive');
    });

    it('falls back to basic sentiment on LLM failure', async () => {
      mockRuntime.generateText = vi.fn().mockRejectedValue(new Error('LLM error'));
      accumulator.llmSentimentEnabled = true;
      
      const sentiment = await accumulator._analyzeSentimentWithLLM('This is terrible!');
      
      expect(sentiment).toBe('negative');
    });

    it('falls back on unexpected LLM response', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('completely invalid');
      accumulator.llmSentimentEnabled = true;
      
      const sentiment = await accumulator._analyzeSentimentWithLLM('Great!');
      
      // Should fall back to basic sentiment
      expect(['positive', 'negative', 'neutral']).toContain(sentiment);
    });

    it('handles negative sentiment', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('negative');
      
      const sentiment = await accumulator._analyzeSentimentWithLLM('This is bad');
      
      expect(sentiment).toBe('negative');
    });

    it('handles neutral sentiment', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('neutral');
      
      const sentiment = await accumulator._analyzeSentimentWithLLM('Just checking');
      
      expect(sentiment).toBe('neutral');
    });
  });

  describe('_analyzeBatchSentimentWithLLM', () => {
    it('analyzes multiple sentiments in batch', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('positive\nnegative\nneutral');
      
      const contents = ['Great!', 'Terrible!', 'OK'];
      const sentiments = await accumulator._analyzeBatchSentimentWithLLM(contents);
      
      expect(sentiments).toEqual(['positive', 'negative', 'neutral']);
    });

    it('handles empty array', async () => {
      const sentiments = await accumulator._analyzeBatchSentimentWithLLM([]);
      
      expect(sentiments).toEqual([]);
    });

    it('handles single item', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('positive');
      
      const sentiments = await accumulator._analyzeBatchSentimentWithLLM(['Great!']);
      
      expect(sentiments).toEqual(['positive']);
    });

    it('limits batch size', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('positive\n'.repeat(10));
      
      const contents = Array(15).fill('Test');
      const sentiments = await accumulator._analyzeBatchSentimentWithLLM(contents);
      
      expect(sentiments.length).toBe(15);
    });

    it('falls back to basic sentiment on error', async () => {
      mockRuntime.generateText = vi.fn().mockRejectedValue(new Error('Batch failed'));
      
      const contents = ['Great!', 'Bad!'];
      const sentiments = await accumulator._analyzeBatchSentimentWithLLM(contents);
      
      expect(sentiments.length).toBe(2);
      expect(sentiments.every(s => ['positive', 'negative', 'neutral'].includes(s))).toBe(true);
    });

    it('uses fallback for unparseable lines', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('positive\ninvalid\nneutral');
      
      const contents = ['Great!', 'Unknown', 'OK'];
      const sentiments = await accumulator._analyzeBatchSentimentWithLLM(contents);
      
      expect(sentiments.length).toBe(3);
      // Second item should use fallback
      expect(['positive', 'negative', 'neutral']).toContain(sentiments[1]);
    });
  });

  describe('_extractTopicsWithLLM', () => {
    it('extracts topics using LLM', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('bitcoin, nostr, lightning');
      
      const topics = await accumulator._extractTopicsWithLLM('Discussing Bitcoin and Nostr with Lightning Network');
      
      expect(topics).toContain('bitcoin');
      expect(topics).toContain('nostr');
      expect(topics).toContain('lightning');
    });

    it('filters forbidden words', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('bitcoin, pixel, art, nostr');
      
      const topics = await accumulator._extractTopicsWithLLM('Content about bitcoin and pixel art');
      
      expect(topics).toContain('bitcoin');
      expect(topics).toContain('nostr');
      expect(topics).not.toContain('pixel');
      expect(topics).not.toContain('art');
    });

    it('filters generic terms', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('bitcoin, general, various, discussion');
      
      const topics = await accumulator._extractTopicsWithLLM('Discussion about bitcoin');
      
      expect(topics).toEqual(['bitcoin']);
    });

    it('limits to 3 topics', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('topic1, topic2, topic3, topic4, topic5');
      
      const topics = await accumulator._extractTopicsWithLLM('Content with many topics');
      
      expect(topics.length).toBeLessThanOrEqual(3);
    });

    it('handles none response', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('none');
      
      const topics = await accumulator._extractTopicsWithLLM('Content');
      
      expect(topics).toEqual([]);
    });

    it('handles empty response', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('');
      
      const topics = await accumulator._extractTopicsWithLLM('Content');
      
      expect(topics).toEqual([]);
    });

    it('sanitizes topics', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('bitcoin!, "nostr", lightning (network)');
      
      const topics = await accumulator._extractTopicsWithLLM('Content');
      
      expect(topics).toContain('bitcoin');
      expect(topics).toContain('nostr');
      expect(topics).toContain('lightning network');
    });

    it('handles LLM failure', async () => {
      mockRuntime.generateText = vi.fn().mockRejectedValue(new Error('LLM failed'));
      
      const topics = await accumulator._extractTopicsWithLLM('Content');
      
      expect(topics).toEqual([]);
    });

    it('truncates long content', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('topic');
      const longContent = 'x'.repeat(1000);
      
      await accumulator._extractTopicsWithLLM(longContent);
      
      const prompt = mockRuntime.generateText.mock.calls[0][0];
      expect(prompt).not.toContain('x'.repeat(900));
    });

    it('rejects overly long topics', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('valid, ' + 'x'.repeat(60));
      
      const topics = await accumulator._extractTopicsWithLLM('Content');
      
      expect(topics).toEqual(['valid']);
    });
  });

  describe('_refineTopicsForDigest', () => {
    beforeEach(() => {
      accumulator.llmTopicExtractionEnabled = true;
    });

    it('skips refinement when LLM disabled', async () => {
      accumulator.llmTopicExtractionEnabled = false;
      
      const digest = { topics: new Map([['general', 10]]) };
      const refined = await accumulator._refineTopicsForDigest(digest);
      
      expect(refined).toBe(digest.topics);
    });

    it('skips refinement when general is less than 30%', async () => {
      const topics = new Map([
        ['general', 5],
        ['bitcoin', 10],
        ['nostr', 10]
      ]);
      
      const refined = await accumulator._refineTopicsForDigest({ topics });
      
      expect(refined).toBe(topics);
    });

    it('refines vague general topics', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('bitcoin, lightning, nostr');
      
      const topics = new Map([
        ['general', 20],
        ['bitcoin', 5]
      ]);
      
      // Add daily events with general topic
      for (let i = 0; i < 10; i++) {
        accumulator.dailyEvents.push({
          topics: ['general'],
          content: 'Content about bitcoin and lightning'
        });
      }
      
      const refined = await accumulator._refineTopicsForDigest({ topics });
      
      expect(refined.has('general')).toBe(false);
      expect(refined.has('bitcoin')).toBe(true);
    });

    it('skips when not enough data', async () => {
      const topics = new Map([['general', 20]]);
      
      // Only 2 events, needs 3+
      accumulator.dailyEvents.push(
        { topics: ['general'], content: 'Content 1' },
        { topics: ['general'], content: 'Content 2' }
      );
      
      const refined = await accumulator._refineTopicsForDigest({ topics });
      
      expect(refined).toBe(topics);
    });

    it('handles refinement errors gracefully', async () => {
      mockRuntime.generateText = vi.fn().mockRejectedValue(new Error('Refinement failed'));
      
      const topics = new Map([['general', 20]]);
      
      for (let i = 0; i < 5; i++) {
        accumulator.dailyEvents.push({ topics: ['general'], content: 'Content' });
      }
      
      const refined = await accumulator._refineTopicsForDigest({ topics });
      
      expect(refined).toBe(topics);
    });
  });
});

describe('ContextAccumulator - LLM Narrative Generation', () => {
  let accumulator;
  let mockRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    mockRuntime = createMockRuntime();
    accumulator = new ContextAccumulator(mockRuntime, noopLogger, { llmAnalysis: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('_generateLLMNarrativeSummary', () => {
    let mockDigest;

    beforeEach(() => {
      mockDigest = accumulator._createEmptyDigest();
      mockDigest.eventCount = 50;
      mockDigest.users.add('user1');
      mockDigest.users.add('user2');
      mockDigest.topics.set('bitcoin', 20);
      mockDigest.topics.set('nostr', 15);
      mockDigest.sentiment.positive = 30;
      mockDigest.sentiment.neutral = 15;
      mockDigest.sentiment.negative = 5;

      // Add daily events
      for (let i = 0; i < 50; i++) {
        accumulator.dailyEvents.push({
          id: `evt-${i}`,
          author: `user-${i % 5}`,
          content: `Content about bitcoin and nostr ${i}`,
          topics: ['bitcoin', 'nostr'],
          sentiment: 'positive',
          timestamp: Date.now()
        });
      }
    });

    it('returns null when runtime not available', async () => {
      accumulator.runtime = null;
      
      const narrative = await accumulator._generateLLMNarrativeSummary(mockDigest);
      
      expect(narrative).toBeNull();
    });

    it('returns null when not enough events', async () => {
      accumulator.dailyEvents = accumulator.dailyEvents.slice(0, 3);
      
      const narrative = await accumulator._generateLLMNarrativeSummary(mockDigest);
      
      expect(narrative).toBeNull();
    });

    it('generates narrative from LLM', async () => {
      const mockNarrative = {
        headline: 'Active hour for Bitcoin and Nostr',
        summary: 'Community discussing innovations',
        insights: ['High engagement', 'Positive sentiment'],
        vibe: 'electric',
        keyMoment: 'New protocol discussion',
        connections: ['Developers collaborating']
      };
      
      mockRuntime.generateText = vi.fn().mockResolvedValue(JSON.stringify(mockNarrative));
      
      const narrative = await accumulator._generateLLMNarrativeSummary(mockDigest);
      
      expect(narrative).toBeDefined();
      expect(narrative.headline).toBe(mockNarrative.headline);
      expect(narrative.vibe).toBe(mockNarrative.vibe);
    });

    it('extracts JSON from response with extra text', async () => {
      const mockNarrative = {
        headline: 'Test',
        summary: 'Summary',
        insights: [],
        vibe: 'calm',
        keyMoment: 'Moment',
        connections: []
      };
      
      mockRuntime.generateText = vi.fn().mockResolvedValue(
        `Here is the analysis: ${JSON.stringify(mockNarrative)} End of response.`
      );
      
      const narrative = await accumulator._generateLLMNarrativeSummary(mockDigest);
      
      expect(narrative).toBeDefined();
      expect(narrative.headline).toBe('Test');
    });

    it('provides fallback structure on parse error', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('Invalid JSON response');
      
      const narrative = await accumulator._generateLLMNarrativeSummary(mockDigest);
      
      expect(narrative).toBeDefined();
      expect(narrative.headline).toBeDefined();
      expect(narrative.summary).toBeDefined();
      expect(narrative.vibe).toBe('active');
    });

    it('handles LLM generation failure', async () => {
      mockRuntime.generateText = vi.fn().mockRejectedValue(new Error('LLM failed'));
      
      const narrative = await accumulator._generateLLMNarrativeSummary(mockDigest);
      
      expect(narrative).toBeNull();
    });

    it('samples events appropriately', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('{"headline": "test", "summary": "test", "insights": [], "vibe": "active", "keyMoment": "test", "connections": []}');
      
      await accumulator._generateLLMNarrativeSummary(mockDigest);
      
      expect(mockRuntime.generateText).toHaveBeenCalled();
      const prompt = mockRuntime.generateText.mock.calls[0][0];
      
      // Should include activity data
      expect(prompt).toContain('50 posts');
      expect(prompt).toContain('bitcoin');
      expect(prompt).toContain('nostr');
    });
  });

  describe('_generateDailyNarrativeSummary', () => {
    let mockReport;

    beforeEach(() => {
      mockReport = {
        date: '2024-05-05',
        summary: {
          totalEvents: 100,
          activeUsers: 20,
          eventsPerUser: '5.0',
          topTopics: [
            { topic: 'bitcoin', count: 40 },
            { topic: 'nostr', count: 30 }
          ],
          emergingStories: [],
          overallSentiment: { positive: 60, neutral: 30, negative: 10 }
        }
      };

      // Add daily events
      for (let i = 0; i < 100; i++) {
        accumulator.dailyEvents.push({
          id: `evt-${i}`,
          author: `user-${i % 20}`,
          content: `Daily content ${i}`,
          topics: ['bitcoin', 'nostr'],
          sentiment: 'positive',
          timestamp: Date.now()
        });
      }
    });

    it('returns null when runtime not available', async () => {
      accumulator.runtime = null;
      
      const narrative = await accumulator._generateDailyNarrativeSummary(mockReport, mockReport.summary.topTopics);
      
      expect(narrative).toBeNull();
    });

    it('generates daily narrative', async () => {
      const mockNarrative = {
        headline: 'Bitcoin and Nostr dominate the day',
        summary: 'Active community engagement around Bitcoin and Nostr protocols',
        arc: 'Morning discussions, afternoon growth, evening consolidation',
        keyMoments: ['Protocol announcement', 'Community milestone'],
        communities: ['Bitcoin devs', 'Nostr enthusiasts'],
        insights: ['High collaboration', 'Positive momentum'],
        vibe: 'energetic',
        tomorrow: 'Watch for continued protocol development'
      };
      
      mockRuntime.generateText = vi.fn().mockResolvedValue(JSON.stringify(mockNarrative));
      
      const narrative = await accumulator._generateDailyNarrativeSummary(mockReport, mockReport.summary.topTopics);
      
      expect(narrative).toBeDefined();
      expect(narrative.headline).toBe(mockNarrative.headline);
      expect(narrative.arc).toBe(mockNarrative.arc);
    });

    it('samples events from throughout the day', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('{"headline": "test", "summary": "test", "arc": "test", "keyMoments": [], "communities": [], "insights": [], "vibe": "active", "tomorrow": "test"}');
      
      await accumulator._generateDailyNarrativeSummary(mockReport, mockReport.summary.topTopics);
      
      expect(mockRuntime.generateText).toHaveBeenCalled();
      const prompt = mockRuntime.generateText.mock.calls[0][0];
      
      expect(prompt).toContain('100 total posts');
      expect(prompt).toContain('20 active users');
    });

    it('handles parse errors with fallback', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('Invalid daily narrative');
      
      const narrative = await accumulator._generateDailyNarrativeSummary(mockReport, mockReport.summary.topTopics);
      
      expect(narrative).toBeDefined();
      expect(narrative.headline).toBeDefined();
      expect(narrative.vibe).toBe('active');
    });

    it('handles generation failure', async () => {
      mockRuntime.generateText = vi.fn().mockRejectedValue(new Error('Daily failed'));
      
      const narrative = await accumulator._generateDailyNarrativeSummary(mockReport, mockReport.summary.topTopics);
      
      expect(narrative).toBeNull();
    });
  });
});

describe('ContextAccumulator - Real-time Analysis', () => {
  let accumulator;
  let mockRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    mockRuntime = createMockRuntime();
    accumulator = new ContextAccumulator(mockRuntime, noopLogger, { 
      llmAnalysis: true
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('startRealtimeAnalysis', () => {
    it('does not start when disabled', () => {
      accumulator.realtimeAnalysisEnabled = false;
      
      accumulator.startRealtimeAnalysis();
      
      expect(accumulator.quarterHourInterval).toBeNull();
      expect(accumulator.rollingWindowInterval).toBeNull();
      expect(accumulator.trendDetectionInterval).toBeNull();
    });

    it('starts intervals when enabled', () => {
      accumulator.realtimeAnalysisEnabled = true;
      accumulator.quarterHourAnalysisEnabled = true;
      
      accumulator.startRealtimeAnalysis();
      
      expect(accumulator.rollingWindowInterval).toBeDefined();
      expect(accumulator.trendDetectionInterval).toBeDefined();
    });
  });

  describe('stopRealtimeAnalysis', () => {
    it('clears all intervals', () => {
      accumulator.realtimeAnalysisEnabled = true;
      accumulator.quarterHourAnalysisEnabled = true;
      accumulator.startRealtimeAnalysis();
      
      accumulator.stopRealtimeAnalysis();
      
      expect(accumulator.quarterHourInterval).toBeNull();
      expect(accumulator.rollingWindowInterval).toBeNull();
      expect(accumulator.trendDetectionInterval).toBeNull();
    });
  });

  describe('detectRealtimeTrends', () => {
    beforeEach(() => {
      // Add events to previous 10 minutes
      const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      
      // Previous 5 minutes (10-5 mins ago)
      for (let i = 0; i < 10; i++) {
        accumulator.dailyEvents.push({
          id: `old-${i}`,
          author: `user-${i % 3}`,
          topics: ['bitcoin'],
          sentiment: 'neutral',
          timestamp: tenMinutesAgo + (i * 1000)
        });
      }
      
      // Recent 5 minutes
      for (let i = 0; i < 20; i++) {
        accumulator.dailyEvents.push({
          id: `new-${i}`,
          author: `user-${i % 3}`,
          topics: ['lightning'],
          sentiment: 'positive',
          timestamp: fiveMinutesAgo + (i * 1000)
        });
      }
    });

    it('detects topic spikes', async () => {
      await accumulator.detectRealtimeTrends();
      
      // Should detect lightning as spiking topic
      expect(noopLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('TREND ALERT')
      );
    });

    it('detects activity changes', async () => {
      await accumulator.detectRealtimeTrends();
      
      // Should detect spiking activity (20 vs 10 events)
      expect(noopLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('spiking')
      );
    });

    it('skips when insufficient data', async () => {
      accumulator.dailyEvents = [];
      
      await accumulator.detectRealtimeTrends();
      
      // Should not log trends
      expect(noopLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('TREND ALERT')
      );
    });

    it('detects new users', async () => {
      // Add events with new users in recent period
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      
      for (let i = 0; i < 5; i++) {
        accumulator.dailyEvents.push({
          id: `new-user-${i}`,
          author: `brand-new-user-${i}`,
          topics: ['test'],
          sentiment: 'neutral',
          timestamp: fiveMinutesAgo
        });
      }
      
      await accumulator.detectRealtimeTrends();
      
      expect(noopLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('new users')
      );
    });
  });

  describe('performQuarterHourAnalysis', () => {
    beforeEach(() => {
      const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000);
      
      // Add events from last 15 minutes
      for (let i = 0; i < 30; i++) {
        accumulator.dailyEvents.push({
          id: `evt-${i}`,
          author: `user-${i % 5}`,
          content: `Content ${i}`,
          topics: ['bitcoin', 'nostr'],
          sentiment: 'positive',
          timestamp: fifteenMinutesAgo + (i * 30000)
        });
      }
    });

    it('skips when LLM disabled', async () => {
      accumulator.llmAnalysisEnabled = false;
      
      await accumulator.performQuarterHourAnalysis();
      
      expect(mockRuntime.generateText).not.toHaveBeenCalled();
    });

    it('skips when not enough events', async () => {
      accumulator.dailyEvents = accumulator.dailyEvents.slice(0, 5);
      
      await accumulator.performQuarterHourAnalysis();
      
      expect(mockRuntime.generateText).not.toHaveBeenCalled();
    });

    it('analyzes recent 15 minutes', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue(
        JSON.stringify({
          vibe: 'electric',
          trends: ['Bitcoin discussion'],
          keyInteractions: ['Active debate'],
          insights: ['High engagement'],
          moment: 'Peak activity'
        })
      );
      
      await accumulator.performQuarterHourAnalysis();
      
      expect(mockRuntime.generateText).toHaveBeenCalled();
      expect(noopLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('QUARTER-HOUR ANALYSIS')
      );
    });

    it('handles analysis errors gracefully', async () => {
      mockRuntime.generateText = vi.fn().mockRejectedValue(new Error('Analysis failed'));
      
      await expect(accumulator.performQuarterHourAnalysis()).resolves.not.toThrow();
    });
  });

  describe('performRollingWindowAnalysis', () => {
    beforeEach(() => {
      const windowStart = Date.now() - (accumulator.rollingWindowSize * 60 * 1000);
      
      // Add events within rolling window
      for (let i = 0; i < 50; i++) {
        accumulator.dailyEvents.push({
          id: `evt-${i}`,
          author: `user-${i % 10}`,
          content: `Content ${i}`,
          topics: ['bitcoin', 'lightning'],
          sentiment: 'positive',
          timestamp: windowStart + (i * 60000)
        });
      }
    });

    it('skips when LLM disabled', async () => {
      accumulator.llmAnalysisEnabled = false;
      
      await accumulator.performRollingWindowAnalysis();
      
      expect(mockRuntime.generateText).not.toHaveBeenCalled();
    });

    it('skips when not enough events', async () => {
      accumulator.dailyEvents = accumulator.dailyEvents.slice(0, 10);
      
      await accumulator.performRollingWindowAnalysis();
      
      expect(mockRuntime.generateText).not.toHaveBeenCalled();
    });

    it('analyzes rolling window', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue(
        JSON.stringify({
          acceleration: 'accelerating',
          emergingTopics: ['Lightning'],
          sentimentShift: 'improving',
          momentum: ['Protocol discussion'],
          trajectory: 'Growing interest',
          hotspots: ['Technical debates']
        })
      );
      
      await accumulator.performRollingWindowAnalysis();
      
      expect(mockRuntime.generateText).toHaveBeenCalled();
      expect(noopLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('ROLLING WINDOW')
      );
    });

    it('handles parse errors with fallback', async () => {
      mockRuntime.generateText = vi.fn().mockResolvedValue('Invalid JSON');
      
      await accumulator.performRollingWindowAnalysis();
      
      // Should not throw and should use fallback
      expect(noopLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('ROLLING WINDOW')
      );
    });
  });
});
