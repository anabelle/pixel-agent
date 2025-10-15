const { describe, it, expect, beforeEach, vi } = globalThis;
const { NarrativeMemory } = require('../lib/narrativeMemory');

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} };

function createNarrativeMemory(runtime = null) {
  return new NarrativeMemory(runtime, noopLogger);
}

describe('NarrativeMemory - Trends and Comparisons', () => {
  describe('_updateTrendsFromNarrative()', () => {
    it('updates topic trends from narrative', async () => {
      const nm = createNarrativeMemory();
      
      const narrative = {
        summary: {
          topTopics: [
            { topic: 'bitcoin', count: 10 },
            { topic: 'lightning', count: 5 }
          ]
        }
      };
      
      await nm.storeHourlyNarrative(narrative);
      
      expect(nm.topicTrends.has('bitcoin')).toBe(true);
      expect(nm.topicTrends.has('lightning')).toBe(true);
      expect(nm.topicTrends.get('bitcoin').counts).toEqual([10]);
    });

    it('accumulates topic trends over time', async () => {
      const nm = createNarrativeMemory();
      
      await nm.storeHourlyNarrative({
        summary: {
          topTopics: [{ topic: 'bitcoin', count: 10 }]
        }
      });
      
      await nm.storeHourlyNarrative({
        summary: {
          topTopics: [{ topic: 'bitcoin', count: 15 }]
        }
      });
      
      const trend = nm.topicTrends.get('bitcoin');
      expect(trend.counts).toEqual([10, 15]);
      expect(trend.timestamps.length).toBe(2);
    });

    it('limits topic trend data points to 90', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 100; i++) {
        await nm.storeHourlyNarrative({
          summary: {
            topTopics: [{ topic: 'bitcoin', count: i }]
          }
        });
      }
      
      const trend = nm.topicTrends.get('bitcoin');
      expect(trend.counts.length).toBe(90);
      expect(trend.counts[0]).toBe(10); // First 10 removed
    });

    it('updates engagement trends', async () => {
      const nm = createNarrativeMemory();
      
      await nm.storeHourlyNarrative({
        summary: {
          eventCount: 100,
          users: { size: 50 },
          topTopics: []
        }
      });
      
      expect(nm.engagementTrends.length).toBe(1);
      expect(nm.engagementTrends[0].events).toBe(100);
      expect(nm.engagementTrends[0].users).toBe(50);
    });

    it('limits engagement trends to 90 data points', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 100; i++) {
        await nm.storeHourlyNarrative({
          summary: { eventCount: i, users: { size: i }, topTopics: [] }
        });
      }
      
      expect(nm.engagementTrends.length).toBe(90);
    });
  });

  describe('compareWithHistory()', () => {
    it('calculates event trends', async () => {
      const nm = createNarrativeMemory();
      
      // Add historical data
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({
          summary: { totalEvents: 100 }
        });
      }
      
      const currentDigest = {
        eventCount: 150,
        topics: new Map(),
        sentiment: { positive: 10, negative: 5, neutral: 5 }
      };
      
      const comparison = await nm.compareWithHistory(currentDigest, '7d');
      
      expect(comparison.eventTrend).toHaveProperty('direction');
      expect(comparison.eventTrend).toHaveProperty('change');
      expect(comparison.eventTrend.direction).toBe('up');
    });

    it('calculates user trends', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({
          summary: { activeUsers: 50 }
        });
      }
      
      const currentDigest = {
        eventCount: 100,
        users: new Set([1, 2, 3, 4, 5]), // 5 users
        topics: new Map(),
        sentiment: { positive: 10, negative: 5, neutral: 5 }
      };
      
      const comparison = await nm.compareWithHistory(currentDigest, '7d');
      
      expect(comparison.userTrend).toHaveProperty('direction');
      expect(comparison.userTrend.direction).toBe('down');
    });

    it('detects topic shifts', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({
          summary: {
            topTopics: [{ topic: 'bitcoin', count: 10 }]
          }
        });
      }
      
      const currentDigest = {
        eventCount: 100,
        topics: new Map([['ethereum', 5], ['defi', 3]]),
        sentiment: { positive: 10, negative: 5, neutral: 5 }
      };
      
      const comparison = await nm.compareWithHistory(currentDigest, '7d');
      
      expect(comparison.topicChanges.emerging).toContain('ethereum');
      expect(comparison.topicChanges.declining).toContain('bitcoin');
    });

    it('detects sentiment shifts', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({
          summary: {
            overallSentiment: { positive: 10, negative: 10, neutral: 10 }
          }
        });
      }
      
      const currentDigest = {
        eventCount: 100,
        topics: new Map(),
        sentiment: { positive: 25, negative: 0, neutral: 5 }
      };
      
      const comparison = await nm.compareWithHistory(currentDigest, '7d');
      
      expect(comparison.sentimentShift).toBeDefined();
    });

    it('detects emerging patterns', async () => {
      const nm = createNarrativeMemory();
      
      // Low historical activity
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({
          summary: { totalEvents: 10, topTopics: [] }
        });
      }
      
      // High current activity
      const currentDigest = {
        eventCount: 100,
        topics: new Map([
          ['topic1', 5],
          ['topic2', 4],
          ['topic3', 3],
          ['topic4', 2]
        ]),
        sentiment: { positive: 10, negative: 5, neutral: 5 }
      };
      
      const comparison = await nm.compareWithHistory(currentDigest, '7d');
      
      expect(comparison.emergingPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('getTopicEvolution()', () => {
    it('tracks topic mentions over time', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 5; i++) {
        await nm.storeDailyNarrative({
          summary: {
            topTopics: [{ topic: 'bitcoin', count: 10 + i }]
          },
          narrative: { summary: `Day ${i} summary` },
          timestamp: Date.now() - (i * 24 * 60 * 60 * 1000)
        });
      }
      
      const evolution = await nm.getTopicEvolution('bitcoin', 30);
      
      expect(evolution.topic).toBe('bitcoin');
      expect(evolution.dataPoints.length).toBe(5);
      expect(evolution.trend).toBeDefined();
    });

    it('filters by time period', async () => {
      const nm = createNarrativeMemory();
      const now = Date.now();
      
      // Old narrative (beyond 7 days)
      await nm.storeDailyNarrative({
        summary: { topTopics: [{ topic: 'bitcoin', count: 10 }] },
        timestamp: now - (10 * 24 * 60 * 60 * 1000)
      });
      
      // Recent narrative (within 7 days)
      await nm.storeDailyNarrative({
        summary: { topTopics: [{ topic: 'bitcoin', count: 15 }] },
        timestamp: now - (3 * 24 * 60 * 60 * 1000)
      });
      
      const evolution = await nm.getTopicEvolution('bitcoin', 7);
      
      expect(evolution.dataPoints.length).toBe(1);
    });

    it('returns empty array for non-existent topic', async () => {
      const nm = createNarrativeMemory();
      
      await nm.storeDailyNarrative({
        summary: { topTopics: [{ topic: 'bitcoin', count: 10 }] }
      });
      
      const evolution = await nm.getTopicEvolution('ethereum', 30);
      
      expect(evolution.dataPoints.length).toBe(0);
    });

    it('calculates trend direction', async () => {
      const nm = createNarrativeMemory();
      const now = Date.now();
      
      // Declining trend
      for (let i = 0; i < 20; i++) {
        await nm.storeDailyNarrative({
          summary: { topTopics: [{ topic: 'bitcoin', count: 20 - i }] },
          timestamp: now - (i * 24 * 60 * 60 * 1000)
        });
      }
      
      const evolution = await nm.getTopicEvolution('bitcoin', 30);
      
      expect(evolution.trend).toBe('declining');
    });

    it('includes top subtopics from cluster data', async () => {
      const nm = createNarrativeMemory();
      const now = Date.now();
      
      // Setup cluster data
      nm.topicClusters.set('bitcoin', {
        subtopics: new Set(['mining', 'price', 'adoption']),
        timeline: [
          { subtopic: 'mining', timestamp: now },
          { subtopic: 'price', timestamp: now },
          { subtopic: 'price', timestamp: now }
        ],
        currentPhase: 'growth'
      });
      
      await nm.storeDailyNarrative({
        summary: { topTopics: [{ topic: 'bitcoin', count: 10 }] },
        timestamp: now
      });
      
      const evolution = await nm.getTopicEvolution('bitcoin', 30);
      
      expect(evolution.topSubtopics).toBeDefined();
      expect(evolution.currentPhase).toBe('growth');
    });
  });

  describe('getSimilarPastMoments()', () => {
    it('finds similar narratives by topic overlap', async () => {
      const nm = createNarrativeMemory();
      
      // Past narrative with bitcoin
      await nm.storeDailyNarrative({
        summary: {
          topTopics: [
            { topic: 'bitcoin', count: 10 },
            { topic: 'lightning', count: 5 }
          ]
        },
        narrative: { summary: 'Past bitcoin discussion' },
        timestamp: Date.now() - (30 * 24 * 60 * 60 * 1000)
      });
      
      // Current digest with bitcoin
      const currentDigest = {
        topics: new Map([['bitcoin', 10], ['nostr', 5]]),
        sentiment: { positive: 10, negative: 5, neutral: 5 }
      };
      
      const similar = await nm.getSimilarPastMoments(currentDigest, 5);
      
      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0]).toHaveProperty('similarity');
      expect(similar[0]).toHaveProperty('date');
    });

    it('limits results to specified count', async () => {
      const nm = createNarrativeMemory();
      
      // Add 10 similar narratives
      for (let i = 0; i < 10; i++) {
        await nm.storeDailyNarrative({
          summary: {
            topTopics: [{ topic: 'bitcoin', count: 10 }]
          },
          timestamp: Date.now() - (i * 24 * 60 * 60 * 1000)
        });
      }
      
      const currentDigest = {
        topics: new Map([['bitcoin', 10]]),
        sentiment: { positive: 10, negative: 5, neutral: 5 }
      };
      
      const similar = await nm.getSimilarPastMoments(currentDigest, 3);
      
      expect(similar.length).toBe(3);
    });

    it('filters out low similarity matches', async () => {
      const nm = createNarrativeMemory();
      
      // Completely different topic
      await nm.storeDailyNarrative({
        summary: {
          topTopics: [{ topic: 'ethereum', count: 10 }],
          overallSentiment: { positive: 0, negative: 20, neutral: 0 }
        }
      });
      
      const currentDigest = {
        topics: new Map([['bitcoin', 10]]),
        sentiment: { positive: 20, negative: 0, neutral: 0 }
      };
      
      const similar = await nm.getSimilarPastMoments(currentDigest, 5);
      
      // Should filter out due to low similarity
      expect(similar.length).toBe(0);
    });

    it('considers sentiment similarity', async () => {
      const nm = createNarrativeMemory();
      
      // Similar topics and sentiment
      await nm.storeDailyNarrative({
        summary: {
          topTopics: [{ topic: 'bitcoin', count: 10 }],
          overallSentiment: { positive: 15, negative: 5, neutral: 5 }
        },
        narrative: { summary: 'Positive bitcoin news' }
      });
      
      const currentDigest = {
        topics: new Map([['bitcoin', 10]]),
        sentiment: { positive: 20, negative: 0, neutral: 5 }
      };
      
      const similar = await nm.getSimilarPastMoments(currentDigest, 5);
      
      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0].similarity).toBeGreaterThan(0.3);
    });

    it('sorts results by similarity', async () => {
      const nm = createNarrativeMemory();
      
      // High similarity
      await nm.storeDailyNarrative({
        summary: {
          topTopics: [{ topic: 'bitcoin', count: 10 }, { topic: 'lightning', count: 5 }],
          overallSentiment: { positive: 15, negative: 5, neutral: 5 }
        },
        narrative: { summary: 'High similarity' },
        timestamp: 1000
      });
      
      // Medium similarity
      await nm.storeDailyNarrative({
        summary: {
          topTopics: [{ topic: 'bitcoin', count: 10 }],
          overallSentiment: { positive: 10, negative: 10, neutral: 5 }
        },
        narrative: { summary: 'Medium similarity' },
        timestamp: 2000
      });
      
      const currentDigest = {
        topics: new Map([['bitcoin', 10], ['lightning', 5]]),
        sentiment: { positive: 20, negative: 0, neutral: 5 }
      };
      
      const similar = await nm.getSimilarPastMoments(currentDigest, 5);
      
      expect(similar[0].summary).toBe('High similarity');
    });
  });

  describe('_calculateTrendDirection()', () => {
    it('returns "rising" for upward trend', () => {
      const nm = createNarrativeMemory();
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30];
      
      const direction = nm._calculateTrendDirection(values);
      
      expect(direction).toBe('rising');
    });

    it('returns "declining" for downward trend', () => {
      const nm = createNarrativeMemory();
      const values = [30, 25, 20, 15, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      
      const direction = nm._calculateTrendDirection(values);
      
      expect(direction).toBe('declining');
    });

    it('returns "stable" for stable trend', () => {
      const nm = createNarrativeMemory();
      const values = [10, 11, 10, 9, 10, 11, 10, 9, 10, 11, 10, 9, 10, 11];
      
      const direction = nm._calculateTrendDirection(values);
      
      expect(direction).toBe('stable');
    });

    it('returns "stable" for insufficient data', () => {
      const nm = createNarrativeMemory();
      const values = [10];
      
      const direction = nm._calculateTrendDirection(values);
      
      expect(direction).toBe('stable');
    });
  });

  describe('_aggregateTopTopics()', () => {
    it('aggregates topics across narratives', () => {
      const nm = createNarrativeMemory();
      
      const narratives = [
        { summary: { topTopics: [{ topic: 'bitcoin', count: 5 }, { topic: 'lightning', count: 3 }] } },
        { summary: { topTopics: [{ topic: 'bitcoin', count: 10 }, { topic: 'nostr', count: 2 }] } }
      ];
      
      const aggregated = nm._aggregateTopTopics(narratives);
      
      expect(aggregated.find(t => t.topic === 'bitcoin').count).toBe(15);
      expect(aggregated.find(t => t.topic === 'lightning').count).toBe(3);
    });

    it('sorts topics by count', () => {
      const nm = createNarrativeMemory();
      
      const narratives = [
        { summary: { topTopics: [{ topic: 'a', count: 5 }, { topic: 'b', count: 10 }, { topic: 'c', count: 3 }] } }
      ];
      
      const aggregated = nm._aggregateTopTopics(narratives);
      
      expect(aggregated[0].topic).toBe('b');
      expect(aggregated[1].topic).toBe('a');
      expect(aggregated[2].topic).toBe('c');
    });

    it('limits to top 10 topics', () => {
      const nm = createNarrativeMemory();
      
      const topTopics = [];
      for (let i = 0; i < 20; i++) {
        topTopics.push({ topic: `topic${i}`, count: 20 - i });
      }
      
      const narratives = [{ summary: { topTopics } }];
      const aggregated = nm._aggregateTopTopics(narratives);
      
      expect(aggregated.length).toBe(10);
    });
  });

  describe('_aggregateSentiment()', () => {
    it('returns dominant sentiment', () => {
      const nm = createNarrativeMemory();
      
      const narratives = [
        { summary: { overallSentiment: { positive: 20, negative: 5, neutral: 5 } } },
        { summary: { overallSentiment: { positive: 15, negative: 10, neutral: 5 } } }
      ];
      
      const sentiment = nm._aggregateSentiment(narratives);
      
      expect(sentiment).toBe('positive');
    });

    it('handles negative dominant sentiment', () => {
      const nm = createNarrativeMemory();
      
      const narratives = [
        { summary: { overallSentiment: { positive: 5, negative: 20, neutral: 5 } } },
        { summary: { overallSentiment: { positive: 3, negative: 25, neutral: 2 } } }
      ];
      
      const sentiment = nm._aggregateSentiment(narratives);
      
      expect(sentiment).toBe('negative');
    });

    it('returns neutral for balanced sentiment', () => {
      const nm = createNarrativeMemory();
      
      const narratives = [
        { summary: { overallSentiment: { positive: 10, negative: 10, neutral: 10 } } }
      ];
      
      const sentiment = nm._aggregateSentiment(narratives);
      
      expect(sentiment).toBe('neutral');
    });

    it('returns neutral for empty narratives', () => {
      const nm = createNarrativeMemory();
      
      const sentiment = nm._aggregateSentiment([]);
      
      expect(sentiment).toBe('neutral');
    });
  });
});
