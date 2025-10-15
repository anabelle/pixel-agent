import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeContextProvider } from '../lib/narrativeContextProvider.js';

// Mock logger
const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
});

// Mock NarrativeMemory
const createMockNarrativeMemory = () => ({
  compareWithHistory: vi.fn(),
  getTopicEvolution: vi.fn(),
  getSimilarPastMoments: vi.fn(),
  getStats: vi.fn().mockReturnValue({ hourlyNarratives: 10, dailyNarratives: 5 })
});

// Mock ContextAccumulator
const createMockContextAccumulator = () => ({
  enabled: true,
  emergingStoryContextMinUsers: 5,
  emergingStoryContextMinMentions: 3,
  emergingStoryContextMaxTopics: 20,
  emergingStoryContextRecentEvents: 5,
  getEmergingStories: vi.fn().mockReturnValue([]),
  getCurrentActivity: vi.fn().mockReturnValue({
    events: 0,
    users: 0,
    topics: []
  }),
  getRecentDigest: vi.fn().mockReturnValue(null),
  getStats: vi.fn().mockReturnValue({ hourlyDigests: 3, emergingStories: 2 })
});

describe('NarrativeContextProvider', () => {
  describe('Initialization', () => {
    it('initializes with narrative memory, context accumulator, and logger', () => {
      const narrativeMemory = createMockNarrativeMemory();
      const contextAccumulator = createMockContextAccumulator();
      const logger = createMockLogger();

      const provider = new NarrativeContextProvider(narrativeMemory, contextAccumulator, logger);

      expect(provider.narrativeMemory).toBe(narrativeMemory);
      expect(provider.contextAccumulator).toBe(contextAccumulator);
      expect(provider.logger).toBe(logger);
    });

    it('uses console as default logger when not provided', () => {
      const narrativeMemory = createMockNarrativeMemory();
      const contextAccumulator = createMockContextAccumulator();

      const provider = new NarrativeContextProvider(narrativeMemory, contextAccumulator);

      expect(provider.logger).toBe(console);
    });

    it('handles missing narrative memory', () => {
      const contextAccumulator = createMockContextAccumulator();
      const logger = createMockLogger();

      const provider = new NarrativeContextProvider(null, contextAccumulator, logger);

      expect(provider.narrativeMemory).toBe(null);
    });

    it('handles missing context accumulator', () => {
      const narrativeMemory = createMockNarrativeMemory();
      const logger = createMockLogger();

      const provider = new NarrativeContextProvider(narrativeMemory, null, logger);

      expect(provider.contextAccumulator).toBe(null);
    });
  });

  describe('_extractTopicsFromMessage', () => {
    let provider;

    beforeEach(() => {
      provider = new NarrativeContextProvider(null, null, createMockLogger());
    });

    it('extracts bitcoin-related topics', () => {
      const topics = provider._extractTopicsFromMessage('I love bitcoin and btc prices');
      expect(topics).toContain('bitcoin');
    });

    it('extracts lightning network topics', () => {
      const topics = provider._extractTopicsFromMessage('Lightning network and ln payments');
      expect(topics).toContain('lightning');
    });

    it('extracts nostr topics', () => {
      const topics = provider._extractTopicsFromMessage('Check out this nostr relay');
      expect(topics).toContain('nostr');
    });

    it('extracts pixel art topics', () => {
      const topics = provider._extractTopicsFromMessage('Creating pixel art on the canvas');
      expect(topics).toContain('pixel art');
    });

    it('extracts AI topics', () => {
      const topics = provider._extractTopicsFromMessage('This AI agent uses GPT');
      expect(topics).toContain('ai');
    });

    it('extracts privacy topics', () => {
      const topics = provider._extractTopicsFromMessage('Privacy and encryption matter');
      expect(topics).toContain('privacy');
    });

    it('extracts decentralization topics', () => {
      const topics = provider._extractTopicsFromMessage('Decentralization is permissionless');
      expect(topics).toContain('decentralization');
    });

    it('extracts community topics', () => {
      const topics = provider._extractTopicsFromMessage('The pleb community is great');
      expect(topics).toContain('community');
    });

    it('extracts technology topics', () => {
      const topics = provider._extractTopicsFromMessage('Building tech with code');
      expect(topics).toContain('technology');
    });

    it('extracts economy topics', () => {
      const topics = provider._extractTopicsFromMessage('Economy and inflation concerns');
      expect(topics).toContain('economy');
    });

    it('extracts multiple topics from single message', () => {
      const topics = provider._extractTopicsFromMessage('Bitcoin lightning network for payments');
      expect(topics).toContain('bitcoin');
      expect(topics).toContain('lightning');
    });

    it('returns empty array for null message', () => {
      const topics = provider._extractTopicsFromMessage(null);
      expect(topics).toEqual([]);
    });

    it('returns empty array for undefined message', () => {
      const topics = provider._extractTopicsFromMessage(undefined);
      expect(topics).toEqual([]);
    });

    it('returns empty array for non-string message', () => {
      const topics = provider._extractTopicsFromMessage(123);
      expect(topics).toEqual([]);
    });

    it('returns empty array for message with no matching topics', () => {
      const topics = provider._extractTopicsFromMessage('Hello world');
      expect(topics).toEqual([]);
    });

    it('is case insensitive', () => {
      const topics = provider._extractTopicsFromMessage('BITCOIN and Lightning NETWORK');
      expect(topics).toContain('bitcoin');
      expect(topics).toContain('lightning');
    });
  });

  describe('_buildContextSummary', () => {
    let provider;

    beforeEach(() => {
      provider = new NarrativeContextProvider(null, null, createMockLogger());
    });

    it('returns empty string when context has no data', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: null,
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toBe('');
    });

    it('includes current activity when events > 10', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: null,
        currentActivity: {
          events: 50,
          users: 20,
          topics: [
            { topic: 'bitcoin', count: 15 },
            { topic: 'lightning', count: 10 }
          ]
        }
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('CURRENT:');
      expect(summary).toContain('50 posts');
      expect(summary).toContain('20 users');
      expect(summary).toContain('bitcoin');
    });

    it('skips current activity when events <= 10', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: null,
        currentActivity: {
          events: 5,
          users: 3,
          topics: []
        }
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).not.toContain('CURRENT:');
    });

    it('includes emerging stories', () => {
      const context = {
        emergingStories: [
          { topic: 'bitcoin', mentions: 25, users: 15 },
          { topic: 'lightning', mentions: 20, users: 12 }
        ],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: null,
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('TRENDING:');
      expect(summary).toContain('bitcoin(25 mentions, 15 users)');
      expect(summary).toContain('lightning(20 mentions, 12 users)');
    });

    it('limits emerging stories to 2', () => {
      const context = {
        emergingStories: [
          { topic: 'bitcoin', mentions: 25, users: 15 },
          { topic: 'lightning', mentions: 20, users: 12 },
          { topic: 'nostr', mentions: 18, users: 10 }
        ],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: null,
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('bitcoin');
      expect(summary).toContain('lightning');
      expect(summary).not.toContain('nostr');
    });

    it('includes historical insights with event trend', () => {
      const context = {
        emergingStories: [],
        historicalInsights: {
          eventTrend: { change: 50, direction: 'up' },
          topicChanges: null
        },
        similarMoments: [],
        topicEvolution: null,
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('ACTIVITY:');
      expect(summary).toContain('up 50% vs usual');
    });

    it('includes historical insights with new topics', () => {
      const context = {
        emergingStories: [],
        historicalInsights: {
          eventTrend: null,
          topicChanges: {
            emerging: ['ai agents', 'pixel art', 'zaps']
          }
        },
        similarMoments: [],
        topicEvolution: null,
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('NEW TOPICS:');
      expect(summary).toContain('ai agents');
      expect(summary).toContain('pixel art');
      expect(summary).toContain('zaps');
    });

    it('skips event trend when change <= 20', () => {
      const context = {
        emergingStories: [],
        historicalInsights: {
          eventTrend: { change: 15, direction: 'up' },
          topicChanges: null
        },
        similarMoments: [],
        topicEvolution: null,
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).not.toContain('ACTIVITY:');
    });

    it('includes topic evolution with trend', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: {
          topic: 'bitcoin',
          trend: 'rising',
          dataPoints: [
            { mentions: 5 },
            { mentions: 10 },
            { mentions: 15 }
          ],
          currentPhase: 'speculation',
          topSubtopics: []
        },
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('BITCOIN:');
      expect(summary).toContain('rising');
      expect(summary).toContain('5→10→15');
    });

    it('includes topic evolution phase', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: {
          topic: 'bitcoin',
          trend: 'stable',
          dataPoints: [{ mentions: 10 }],
          currentPhase: 'adoption',
          topSubtopics: []
        },
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('PHASE: adoption');
    });

    it('includes topic evolution angles', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: {
          topic: 'bitcoin',
          trend: 'stable',
          dataPoints: [{ mentions: 10 }],
          currentPhase: 'general',
          topSubtopics: [
            { subtopic: 'Price Analysis!' },
            { subtopic: 'ETF News@#$' },
            { subtopic: 'Mining Updates' }
          ]
        },
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('ANGLES:');
      expect(summary).toContain('price-analysis');
      expect(summary).toContain('etf-news');
      expect(summary).toContain('mining-updates');
    });

    it('skips topic evolution when neutral phase, stable trend, and no angles', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: {
          topic: 'bitcoin',
          trend: 'stable',
          dataPoints: [{ mentions: 10 }],
          currentPhase: 'general',
          topSubtopics: []
        },
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).not.toContain('BITCOIN:');
      expect(summary).not.toContain('PHASE:');
      expect(summary).not.toContain('ANGLES:');
    });

    it('includes similar moments', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [
          {
            date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            similarity: 0.85
          }
        ],
        topicEvolution: null,
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('SIMILAR:');
      expect(summary).toContain('3d ago');
      expect(summary).toContain('85% match');
    });

    it('truncates summary when exceeding maxChars', () => {
      const context = {
        emergingStories: [
          { topic: 'bitcoin', mentions: 25, users: 15 },
          { topic: 'lightning', mentions: 20, users: 12 }
        ],
        historicalInsights: {
          eventTrend: { change: 50, direction: 'up' },
          topicChanges: { emerging: ['ai', 'pixel', 'zaps'] }
        },
        similarMoments: [],
        topicEvolution: null,
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 50);
      expect(summary.length).toBeLessThanOrEqual(50);
      expect(summary).toContain('...');
    });

    it('combines multiple context elements', () => {
      const context = {
        emergingStories: [{ topic: 'bitcoin', mentions: 25, users: 15 }],
        historicalInsights: {
          eventTrend: { change: 50, direction: 'up' },
          topicChanges: null
        },
        similarMoments: [
          {
            date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            similarity: 0.75
          }
        ],
        topicEvolution: null,
        currentActivity: { events: 20, users: 10, topics: [{ topic: 'nostr', count: 5 }] }
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('CURRENT:');
      expect(summary).toContain('TRENDING:');
      expect(summary).toContain('ACTIVITY:');
      expect(summary).toContain('SIMILAR:');
      expect(summary).toContain(' | ');
    });
  });

  describe('getRelevantContext', () => {
    let provider;
    let narrativeMemory;
    let contextAccumulator;
    let logger;

    beforeEach(() => {
      narrativeMemory = createMockNarrativeMemory();
      contextAccumulator = createMockContextAccumulator();
      logger = createMockLogger();
      provider = new NarrativeContextProvider(narrativeMemory, contextAccumulator, logger);
    });

    it('returns context with default options', async () => {
      const context = await provider.getRelevantContext('Hello bitcoin world');

      expect(context).toHaveProperty('hasContext');
      expect(context).toHaveProperty('emergingStories');
      expect(context).toHaveProperty('historicalInsights');
      expect(context).toHaveProperty('similarMoments');
      expect(context).toHaveProperty('topicEvolution');
      expect(context).toHaveProperty('currentActivity');
      expect(context).toHaveProperty('summary');
    });

    it('extracts topics from message', async () => {
      const spy = vi.spyOn(provider, '_extractTopicsFromMessage');
      await provider.getRelevantContext('Bitcoin and lightning network');

      expect(spy).toHaveBeenCalledWith('Bitcoin and lightning network');
    });

    it('fetches emerging stories when message has topics', async () => {
      contextAccumulator.getEmergingStories.mockReturnValue([
        { topic: 'bitcoin', mentions: 25, users: 15 }
      ]);

      const context = await provider.getRelevantContext('What about bitcoin?');

      expect(contextAccumulator.getEmergingStories).toHaveBeenCalled();
      expect(context.emergingStories.length).toBeGreaterThan(0);
    });

    it('filters emerging stories by message topics', async () => {
      contextAccumulator.getEmergingStories.mockReturnValue([
        { topic: 'bitcoin', mentions: 25, users: 15 },
        { topic: 'ethereum', mentions: 20, users: 10 },
        { topic: 'lightning', mentions: 18, users: 12 }
      ]);

      const context = await provider.getRelevantContext('Tell me about bitcoin and lightning');

      expect(context.emergingStories).toHaveLength(2);
      expect(context.emergingStories.find(s => s.topic === 'bitcoin')).toBeTruthy();
      expect(context.emergingStories.find(s => s.topic === 'lightning')).toBeTruthy();
      expect(context.emergingStories.find(s => s.topic === 'ethereum')).toBeFalsy();
    });

    it('skips emerging stories when includeEmergingStories is false', async () => {
      await provider.getRelevantContext('bitcoin', { includeEmergingStories: false });

      expect(contextAccumulator.getEmergingStories).not.toHaveBeenCalled();
    });

    it('fetches current activity', async () => {
      contextAccumulator.getCurrentActivity.mockReturnValue({
        events: 50,
        users: 20,
        topics: [{ topic: 'bitcoin', count: 15 }]
      });

      const context = await provider.getRelevantContext('Hello');

      expect(contextAccumulator.getCurrentActivity).toHaveBeenCalled();
      expect(context.currentActivity.events).toBe(50);
    });

    it('fetches historical comparison when conditions met', async () => {
      const mockDigest = { events: 100, users: 50 };
      contextAccumulator.getRecentDigest.mockReturnValue(mockDigest);
      narrativeMemory.compareWithHistory.mockResolvedValue({
        eventTrend: { change: 50, direction: 'up' },
        topicChanges: { emerging: ['bitcoin'] }
      });

      const context = await provider.getRelevantContext('Hello bitcoin');

      expect(contextAccumulator.getRecentDigest).toHaveBeenCalledWith(1);
      expect(narrativeMemory.compareWithHistory).toHaveBeenCalledWith(mockDigest, '7d');
      expect(context.historicalInsights).not.toBeNull();
    });

    it('skips historical comparison when includeHistoricalComparison is false', async () => {
      await provider.getRelevantContext('bitcoin', { includeHistoricalComparison: false });

      expect(narrativeMemory.compareWithHistory).not.toHaveBeenCalled();
    });

    it('handles historical comparison error gracefully', async () => {
      contextAccumulator.getRecentDigest.mockReturnValue({ events: 100 });
      narrativeMemory.compareWithHistory.mockRejectedValue(new Error('DB error'));

      const context = await provider.getRelevantContext('bitcoin');

      expect(logger.debug).toHaveBeenCalledWith(
        '[NARRATIVE-CONTEXT] Historical comparison failed:',
        'DB error'
      );
      expect(context.historicalInsights).toBeNull();
    });

    it('filters historical insights by significance', async () => {
      contextAccumulator.getRecentDigest.mockReturnValue({ events: 100 });
      narrativeMemory.compareWithHistory.mockResolvedValue({
        eventTrend: { change: 10, direction: 'up' },
        topicChanges: { emerging: [] }
      });

      const context = await provider.getRelevantContext('bitcoin');

      expect(context.historicalInsights).toBeNull();
    });

    it('fetches topic evolution for matching topics', async () => {
      const mockEvolution = {
        dataPoints: [
          { mentions: 5 },
          { mentions: 10 },
          { mentions: 15 },
          { mentions: 20 }
        ]
      };
      narrativeMemory.getTopicEvolution.mockResolvedValue(mockEvolution);

      const context = await provider.getRelevantContext('What about bitcoin?');

      expect(narrativeMemory.getTopicEvolution).toHaveBeenCalledWith('bitcoin', 14);
      expect(context.topicEvolution).toBe(mockEvolution);
    });

    it('skips topic evolution when includeTopicEvolution is false', async () => {
      await provider.getRelevantContext('bitcoin', { includeTopicEvolution: false });

      expect(narrativeMemory.getTopicEvolution).not.toHaveBeenCalled();
    });

    it('skips topic evolution when insufficient data points', async () => {
      narrativeMemory.getTopicEvolution.mockResolvedValue({
        dataPoints: [{ mentions: 5 }, { mentions: 10 }]
      });

      const context = await provider.getRelevantContext('bitcoin');

      expect(context.topicEvolution).toBeNull();
    });

    it('handles topic evolution error gracefully', async () => {
      narrativeMemory.getTopicEvolution.mockRejectedValue(new Error('DB error'));

      const context = await provider.getRelevantContext('bitcoin');

      expect(logger.debug).toHaveBeenCalledWith(
        '[NARRATIVE-CONTEXT] Topic evolution failed:',
        'DB error'
      );
      expect(context.topicEvolution).toBeNull();
    });

    it('fetches similar past moments', async () => {
      const mockDigest = { events: 100 };
      const mockSimilar = [
        { date: '2024-01-01', similarity: 0.85 },
        { date: '2024-01-02', similarity: 0.75 }
      ];
      contextAccumulator.getRecentDigest.mockReturnValue(mockDigest);
      narrativeMemory.getSimilarPastMoments.mockResolvedValue(mockSimilar);

      const context = await provider.getRelevantContext('Hello');

      expect(narrativeMemory.getSimilarPastMoments).toHaveBeenCalledWith(mockDigest, 2);
      expect(context.similarMoments).toBe(mockSimilar);
    });

    it('skips similar moments when includeSimilarMoments is false', async () => {
      await provider.getRelevantContext('Hello', { includeSimilarMoments: false });

      expect(narrativeMemory.getSimilarPastMoments).not.toHaveBeenCalled();
    });

    it('handles similar moments error gracefully', async () => {
      contextAccumulator.getRecentDigest.mockReturnValue({ events: 100 });
      narrativeMemory.getSimilarPastMoments.mockRejectedValue(new Error('DB error'));

      const context = await provider.getRelevantContext('Hello');

      expect(logger.debug).toHaveBeenCalledWith(
        '[NARRATIVE-CONTEXT] Similar moments search failed:',
        'DB error'
      );
      expect(context.similarMoments).toEqual([]);
    });

    it('builds context summary', async () => {
      contextAccumulator.getCurrentActivity.mockReturnValue({
        events: 50,
        users: 20,
        topics: [{ topic: 'bitcoin', count: 15 }]
      });

      const context = await provider.getRelevantContext('bitcoin');

      expect(context.summary).toBeTruthy();
      expect(context.hasContext).toBe(true);
    });

    it('respects maxContext option', async () => {
      contextAccumulator.getCurrentActivity.mockReturnValue({
        events: 50,
        users: 20,
        topics: [{ topic: 'bitcoin', count: 15 }]
      });

      const context = await provider.getRelevantContext('bitcoin', { maxContext: 50 });

      expect(context.summary.length).toBeLessThanOrEqual(50);
    });

    it('logs debug message when context is generated', async () => {
      contextAccumulator.getCurrentActivity.mockReturnValue({
        events: 50,
        users: 20,
        topics: [{ topic: 'bitcoin', count: 15 }]
      });

      await provider.getRelevantContext('bitcoin');

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('[NARRATIVE-CONTEXT] Generated context')
      );
    });

    it('handles missing context accumulator', async () => {
      const providerWithoutAccumulator = new NarrativeContextProvider(narrativeMemory, null, logger);
      const context = await providerWithoutAccumulator.getRelevantContext('bitcoin');

      expect(context.emergingStories).toEqual([]);
      expect(context.currentActivity).toBeNull();
    });

    it('handles missing narrative memory', async () => {
      const providerWithoutMemory = new NarrativeContextProvider(null, contextAccumulator, logger);
      const context = await providerWithoutMemory.getRelevantContext('bitcoin');

      expect(context.historicalInsights).toBeNull();
      expect(context.topicEvolution).toBeNull();
      expect(context.similarMoments).toEqual([]);
    });

    it('returns empty context on error', async () => {
      const providerWithError = new NarrativeContextProvider(narrativeMemory, contextAccumulator, logger);
      vi.spyOn(providerWithError, '_extractTopicsFromMessage').mockImplementation(() => {
        throw new Error('Extraction error');
      });

      const context = await providerWithError.getRelevantContext('bitcoin');

      expect(logger.error).toHaveBeenCalledWith(
        '[NARRATIVE-CONTEXT] Failed to get relevant context:',
        'Extraction error'
      );
      expect(context.hasContext).toBe(false);
    });
  });

  describe('detectProactiveInsight', () => {
    let provider;
    let narrativeMemory;
    let contextAccumulator;
    let logger;

    beforeEach(() => {
      narrativeMemory = createMockNarrativeMemory();
      contextAccumulator = createMockContextAccumulator();
      logger = createMockLogger();
      provider = new NarrativeContextProvider(narrativeMemory, contextAccumulator, logger);
    });

    it('returns null when no context available', async () => {
      vi.spyOn(provider, 'getRelevantContext').mockResolvedValue({
        hasContext: false
      });

      const insight = await provider.detectProactiveInsight('Hello');

      expect(insight).toBeNull();
    });

    it('detects massive activity spike', async () => {
      vi.spyOn(provider, 'getRelevantContext').mockResolvedValue({
        hasContext: true,
        historicalInsights: {
          eventTrend: { change: 150, direction: 'up' }
        }
      });

      const insight = await provider.detectProactiveInsight('Hello');

      expect(insight).not.toBeNull();
      expect(insight.type).toBe('activity_spike');
      expect(insight.message).toContain('150%');
      expect(insight.priority).toBe('high');
    });

    it('does not detect activity spike when change <= 100', async () => {
      vi.spyOn(provider, 'getRelevantContext').mockResolvedValue({
        hasContext: true,
        historicalInsights: {
          eventTrend: { change: 80, direction: 'up' }
        }
      });

      const insight = await provider.detectProactiveInsight('Hello');

      expect(insight).toBeNull();
    });

    it('detects trending topic', async () => {
      vi.spyOn(provider, 'getRelevantContext').mockResolvedValue({
        hasContext: true,
        emergingStories: [
          { topic: 'bitcoin', mentions: 25, users: 15 }
        ]
      });

      const insight = await provider.detectProactiveInsight('bitcoin');

      expect(insight).not.toBeNull();
      expect(insight.type).toBe('trending_topic');
      expect(insight.message).toContain('bitcoin is trending');
      expect(insight.message).toContain('25 mentions');
      expect(insight.priority).toBe('medium');
    });

    it('does not detect trending topic when mentions <= 20', async () => {
      vi.spyOn(provider, 'getRelevantContext').mockResolvedValue({
        hasContext: true,
        emergingStories: [
          { topic: 'bitcoin', mentions: 15, users: 10 }
        ]
      });

      const insight = await provider.detectProactiveInsight('bitcoin');

      expect(insight).toBeNull();
    });

    it('detects topic surge', async () => {
      vi.spyOn(provider, 'getRelevantContext').mockResolvedValue({
        hasContext: true,
        topicEvolution: {
          topic: 'bitcoin',
          trend: 'rising',
          dataPoints: [
            { mentions: 5 },
            { mentions: 8 },
            { mentions: 12 }
          ]
        }
      });

      const insight = await provider.detectProactiveInsight('bitcoin');

      expect(insight).not.toBeNull();
      expect(insight.type).toBe('topic_surge');
      expect(insight.message).toContain('doubled');
      expect(insight.priority).toBe('medium');
    });

    it('does not detect topic surge when not doubling', async () => {
      vi.spyOn(provider, 'getRelevantContext').mockResolvedValue({
        hasContext: true,
        topicEvolution: {
          topic: 'bitcoin',
          trend: 'rising',
          dataPoints: [
            { mentions: 10 },
            { mentions: 12 },
            { mentions: 15 }
          ]
        }
      });

      const insight = await provider.detectProactiveInsight('bitcoin');

      expect(insight).toBeNull();
    });

    it('detects topic context for new users', async () => {
      vi.spyOn(provider, 'getRelevantContext').mockResolvedValue({
        hasContext: true,
        topicEvolution: {
          topic: 'bitcoin',
          dataPoints: [{ mentions: 10 }, { mentions: 12 }]
        }
      });

      const insight = await provider.detectProactiveInsight(
        'bitcoin',
        { relationshipDepth: 'new' }
      );

      expect(insight).not.toBeNull();
      expect(insight.type).toBe('topic_context');
      expect(insight.message).toContain('discussed 2 times recently');
      expect(insight.priority).toBe('low');
    });

    it('does not detect topic context for non-new users', async () => {
      vi.spyOn(provider, 'getRelevantContext').mockResolvedValue({
        hasContext: true,
        topicEvolution: {
          topic: 'bitcoin',
          dataPoints: [{ mentions: 10 }, { mentions: 12 }]
        }
      });

      const insight = await provider.detectProactiveInsight(
        'bitcoin',
        { relationshipDepth: 'established' }
      );

      expect(insight).toBeNull();
    });

    it('handles error gracefully', async () => {
      vi.spyOn(provider, 'getRelevantContext').mockRejectedValue(new Error('Context error'));

      const insight = await provider.detectProactiveInsight('bitcoin');

      expect(logger.debug).toHaveBeenCalledWith(
        '[NARRATIVE-CONTEXT] Proactive insight detection failed:',
        'Context error'
      );
      expect(insight).toBeNull();
    });

    it('passes correct options to getRelevantContext', async () => {
      const spy = vi.spyOn(provider, 'getRelevantContext').mockResolvedValue({
        hasContext: false
      });

      await provider.detectProactiveInsight('bitcoin');

      expect(spy).toHaveBeenCalledWith('bitcoin', {
        includeEmergingStories: true,
        includeHistoricalComparison: true,
        maxContext: 200
      });
    });
  });

  describe('getStats', () => {
    it('returns all stats when both dependencies available', () => {
      const narrativeMemory = createMockNarrativeMemory();
      const contextAccumulator = createMockContextAccumulator();
      const provider = new NarrativeContextProvider(narrativeMemory, contextAccumulator, createMockLogger());

      const stats = provider.getStats();

      expect(stats.narrativeMemoryAvailable).toBe(true);
      expect(stats.contextAccumulatorAvailable).toBe(true);
      expect(stats.contextAccumulatorEnabled).toBe(true);
      expect(stats.narrativeMemoryStats).toEqual({ hourlyNarratives: 10, dailyNarratives: 5 });
      expect(stats.contextAccumulatorStats).toEqual({ hourlyDigests: 3, emergingStories: 2 });
    });

    it('returns stats when narrative memory is missing', () => {
      const contextAccumulator = createMockContextAccumulator();
      const provider = new NarrativeContextProvider(null, contextAccumulator, createMockLogger());

      const stats = provider.getStats();

      expect(stats.narrativeMemoryAvailable).toBe(false);
      expect(stats.contextAccumulatorAvailable).toBe(true);
      expect(stats.narrativeMemoryStats).toBeNull();
      expect(stats.contextAccumulatorStats).not.toBeNull();
    });

    it('returns stats when context accumulator is missing', () => {
      const narrativeMemory = createMockNarrativeMemory();
      const provider = new NarrativeContextProvider(narrativeMemory, null, createMockLogger());

      const stats = provider.getStats();

      expect(stats.narrativeMemoryAvailable).toBe(true);
      expect(stats.contextAccumulatorAvailable).toBe(false);
      expect(stats.contextAccumulatorEnabled).toBe(false);
      expect(stats.narrativeMemoryStats).not.toBeNull();
      expect(stats.contextAccumulatorStats).toBeNull();
    });

    it('handles missing getStats methods gracefully', () => {
      const narrativeMemory = { ...createMockNarrativeMemory(), getStats: undefined };
      const contextAccumulator = { ...createMockContextAccumulator(), getStats: undefined };
      const provider = new NarrativeContextProvider(narrativeMemory, contextAccumulator, createMockLogger());

      const stats = provider.getStats();

      expect(stats.narrativeMemoryStats).toBeNull();
      expect(stats.contextAccumulatorStats).toBeNull();
    });

    it('returns correct enabled status from context accumulator', () => {
      const contextAccumulator = createMockContextAccumulator();
      contextAccumulator.enabled = false;
      const provider = new NarrativeContextProvider(createMockNarrativeMemory(), contextAccumulator, createMockLogger());

      const stats = provider.getStats();

      expect(stats.contextAccumulatorEnabled).toBe(false);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    let provider;
    let narrativeMemory;
    let contextAccumulator;
    let logger;

    beforeEach(() => {
      narrativeMemory = createMockNarrativeMemory();
      contextAccumulator = createMockContextAccumulator();
      logger = createMockLogger();
      provider = new NarrativeContextProvider(narrativeMemory, contextAccumulator, logger);
    });

    it('handles empty message gracefully', async () => {
      const context = await provider.getRelevantContext('');

      expect(context.hasContext).toBe(false);
      expect(context.emergingStories).toEqual([]);
    });

    it('handles undefined options gracefully', async () => {
      const context = await provider.getRelevantContext('bitcoin', undefined);

      expect(context).toHaveProperty('hasContext');
    });

    it('handles null digest from getRecentDigest', async () => {
      contextAccumulator.getRecentDigest.mockReturnValue(null);

      const context = await provider.getRelevantContext('bitcoin');

      expect(context.historicalInsights).toBeNull();
      expect(context.similarMoments).toEqual([]);
    });

    it('handles empty emerging stories array', async () => {
      contextAccumulator.getEmergingStories.mockReturnValue([]);

      const context = await provider.getRelevantContext('bitcoin');

      expect(context.emergingStories).toEqual([]);
    });

    it('handles null comparison result', async () => {
      contextAccumulator.getRecentDigest.mockReturnValue({ events: 100 });
      narrativeMemory.compareWithHistory.mockResolvedValue(null);

      const context = await provider.getRelevantContext('bitcoin');

      expect(context.historicalInsights).toBeNull();
    });

    it('handles null evolution result', async () => {
      narrativeMemory.getTopicEvolution.mockResolvedValue(null);

      const context = await provider.getRelevantContext('bitcoin');

      expect(context.topicEvolution).toBeNull();
    });

    it('handles empty similar moments array', async () => {
      contextAccumulator.getRecentDigest.mockReturnValue({ events: 100 });
      narrativeMemory.getSimilarPastMoments.mockResolvedValue([]);

      const context = await provider.getRelevantContext('bitcoin');

      expect(context.similarMoments).toEqual([]);
    });

    it('handles topic evolution with insufficient data points', async () => {
      narrativeMemory.getTopicEvolution.mockResolvedValue({
        dataPoints: [{ mentions: 5 }]
      });

      const context = await provider.getRelevantContext('bitcoin');

      expect(context.topicEvolution).toBeNull();
    });

    it('handles invalid date in similar moments', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [
          { date: 'invalid-date', similarity: 0.85 }
        ],
        topicEvolution: null,
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('SIMILAR:');
    });

    it('handles missing subtopic field in topSubtopics', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: {
          topic: 'bitcoin',
          trend: 'stable',
          dataPoints: [{ mentions: 10 }],
          currentPhase: 'general',
          topSubtopics: [
            { subtopic: null },
            { subtopic: undefined },
            { subtopic: 'valid topic' }
          ]
        },
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('valid-topic');
    });

    it('handles topics array with empty topics', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: null,
        currentActivity: {
          events: 50,
          users: 20,
          topics: []
        }
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toContain('CURRENT:');
    });

    it('sanitizes special characters in subtopics', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: {
          topic: 'bitcoin',
          trend: 'rising',
          dataPoints: [{ mentions: 10 }],
          currentPhase: 'speculation',
          topSubtopics: [
            { subtopic: 'Test@#$%^&*()!Topic' }
          ]
        },
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      expect(summary).toMatch(/test.*topic/i);
      expect(summary).not.toContain('@');
      expect(summary).not.toContain('#');
    });

    it('handles very long subtopics by truncating', () => {
      const context = {
        emergingStories: [],
        historicalInsights: null,
        similarMoments: [],
        topicEvolution: {
          topic: 'bitcoin',
          trend: 'rising',
          dataPoints: [{ mentions: 10 }],
          currentPhase: 'speculation',
          topSubtopics: [
            { subtopic: 'A very long subtopic that exceeds the maximum character limit and should be truncated' }
          ]
        },
        currentActivity: null
      };

      const summary = provider._buildContextSummary(context, 500);
      const match = summary.match(/ANGLES: ([^|]+)/);
      if (match) {
        const angles = match[1].trim();
        const firstAngle = angles.split(',')[0];
        expect(firstAngle.length).toBeLessThanOrEqual(30);
      }
    });
  });
});
