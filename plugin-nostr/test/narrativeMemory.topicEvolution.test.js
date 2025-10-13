const { describe, it, expect, beforeEach } = globalThis;

const { NarrativeMemory } = require('../lib/narrativeMemory');

describe('NarrativeMemory - Topic Evolution Extensions', () => {
  let memory;
  let mockRuntime;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {}
    };

    mockRuntime = {
      getMemories: async () => []
    };

    memory = new NarrativeMemory(mockRuntime, mockLogger);
  });

  describe('getTopicCluster', () => {
    it('creates new cluster if not exists', () => {
      const cluster = memory.getTopicCluster('bitcoin');

      expect(cluster).toBeDefined();
      expect(cluster.subtopics).toBeInstanceOf(Set);
      expect(cluster.subtopics.size).toBe(0);
      expect(Array.isArray(cluster.entries)).toBe(true);
      expect(cluster.entries.length).toBe(0);
      expect(cluster.lastPhase).toBe(null);
      expect(cluster.lastMentions).toBeInstanceOf(Map);
    });

    it('returns existing cluster', () => {
      const cluster1 = memory.getTopicCluster('bitcoin');
      cluster1.subtopics.add('price');
      
      const cluster2 = memory.getTopicCluster('bitcoin');

      expect(cluster2.subtopics.has('price')).toBe(true);
      expect(cluster1).toBe(cluster2); // Same reference
    });

    it('maintains separate clusters for different topics', () => {
      const bitcoinCluster = memory.getTopicCluster('bitcoin');
      const nostrCluster = memory.getTopicCluster('nostr');

      bitcoinCluster.subtopics.add('price');
      nostrCluster.subtopics.add('relays');

      expect(bitcoinCluster.subtopics.has('price')).toBe(true);
      expect(bitcoinCluster.subtopics.has('relays')).toBe(false);
      expect(nostrCluster.subtopics.has('relays')).toBe(true);
      expect(nostrCluster.subtopics.has('price')).toBe(false);
    });
  });

  describe('updateTopicCluster', () => {
    it('adds subtopic to cluster', () => {
      const entry = {
        subtopic: 'bitcoin price',
        phase: 'speculation',
        timestamp: Date.now(),
        content: 'Bitcoin price might go up'
      };

      memory.updateTopicCluster('bitcoin', entry);
      const cluster = memory.getTopicCluster('bitcoin');

      expect(cluster.subtopics.has('bitcoin price')).toBe(true);
      expect(cluster.entries.length).toBe(1);
      expect(cluster.entries[0].subtopic).toBe('bitcoin price');
    });

    it('updates phase', () => {
      memory.updateTopicCluster('bitcoin', {
        subtopic: 'price',
        phase: 'speculation',
        timestamp: Date.now()
      });

      memory.updateTopicCluster('bitcoin', {
        subtopic: 'price',
        phase: 'announcement',
        timestamp: Date.now()
      });

      const cluster = memory.getTopicCluster('bitcoin');
      expect(cluster.lastPhase).toBe('announcement');
    });

    it('tracks last mention timestamps', () => {
      const timestamp = Date.now();
      memory.updateTopicCluster('bitcoin', {
        subtopic: 'adoption',
        phase: 'adoption',
        timestamp
      });

      const cluster = memory.getTopicCluster('bitcoin');
      expect(cluster.lastMentions.get('adoption')).toBe(timestamp);
    });

    it('maintains bounded entry history', () => {
      // Add more than max entries
      const maxEntries = memory.maxClusterEntries;
      
      for (let i = 0; i < maxEntries + 50; i++) {
        memory.updateTopicCluster('bitcoin', {
          subtopic: `subtopic-${i}`,
          phase: 'general',
          timestamp: Date.now() + i
        });
      }

      const cluster = memory.getTopicCluster('bitcoin');
      expect(cluster.entries.length).toBe(maxEntries);
      
      // Should keep most recent entries
      const lastEntry = cluster.entries[cluster.entries.length - 1];
      expect(lastEntry.subtopic).toBe(`subtopic-${maxEntries + 49}`);
    });

    it('stores content snippets', () => {
      const longContent = 'a'.repeat(300);
      memory.updateTopicCluster('bitcoin', {
        subtopic: 'test',
        phase: 'general',
        timestamp: Date.now(),
        content: longContent
      });

      const cluster = memory.getTopicCluster('bitcoin');
      const entry = cluster.entries[0];
      
      expect(entry.content).toBeDefined();
      expect(entry.content.length).toBeLessThanOrEqual(200);
    });
  });

  describe('getTopicEvolution', () => {
    beforeEach(() => {
      // Set up some historical narratives
      const now = Date.now();
      memory.dailyNarratives = [
        {
          timestamp: now - 5 * 24 * 60 * 60 * 1000, // 5 days ago
          summary: {
            topTopics: [
              { topic: 'bitcoin', count: 10 },
              { topic: 'nostr', count: 5 }
            ],
            overallSentiment: { positive: 0.6, negative: 0.2, neutral: 0.2 }
          },
          narrative: { summary: 'Bitcoin discussion active' }
        },
        {
          timestamp: now - 3 * 24 * 60 * 60 * 1000, // 3 days ago
          summary: {
            topTopics: [
              { topic: 'bitcoin', count: 15 },
              { topic: 'lightning', count: 8 }
            ],
            overallSentiment: { positive: 0.7, negative: 0.1, neutral: 0.2 }
          },
          narrative: { summary: 'Bitcoin momentum building' }
        },
        {
          timestamp: now - 1 * 24 * 60 * 60 * 1000, // 1 day ago
          summary: {
            topTopics: [
              { topic: 'bitcoin', count: 20 },
              { topic: 'adoption', count: 12 }
            ],
            overallSentiment: { positive: 0.8, negative: 0.1, neutral: 0.1 }
          },
          narrative: { summary: 'Bitcoin adoption accelerating' }
        }
      ];

      // Add some cluster data
      memory.updateTopicCluster('bitcoin', {
        subtopic: 'bitcoin price',
        phase: 'speculation',
        timestamp: now - 4 * 24 * 60 * 60 * 1000
      });
      memory.updateTopicCluster('bitcoin', {
        subtopic: 'bitcoin adoption',
        phase: 'adoption',
        timestamp: now - 2 * 24 * 60 * 60 * 1000
      });
      memory.updateTopicCluster('bitcoin', {
        subtopic: 'bitcoin ETF',
        phase: 'announcement',
        timestamp: now - 1 * 24 * 60 * 60 * 1000
      });
    });

    it('returns evolution data with subtopics and phase', async () => {
      const evolution = await memory.getTopicEvolution('bitcoin', 30);

      expect(evolution).toHaveProperty('topic');
      expect(evolution).toHaveProperty('dataPoints');
      expect(evolution).toHaveProperty('trend');
      expect(evolution).toHaveProperty('summary');
      expect(evolution).toHaveProperty('subtopics');
      expect(evolution).toHaveProperty('currentPhase');
      expect(evolution).toHaveProperty('subtopicCount');
    });

    it('includes subtopic distribution', async () => {
      const evolution = await memory.getTopicEvolution('bitcoin', 30);

      expect(Array.isArray(evolution.subtopics)).toBe(true);
      expect(evolution.subtopics.length).toBeGreaterThan(0);
      
      const firstSubtopic = evolution.subtopics[0];
      expect(firstSubtopic).toHaveProperty('subtopic');
      expect(firstSubtopic).toHaveProperty('count');
    });

    it('includes current phase', async () => {
      const evolution = await memory.getTopicEvolution('bitcoin', 30);

      expect(evolution.currentPhase).toBe('announcement'); // Most recent phase
    });

    it('counts unique subtopics', async () => {
      const evolution = await memory.getTopicEvolution('bitcoin', 30);

      expect(evolution.subtopicCount).toBe(3); // bitcoin price, adoption, ETF
    });

    it('filters by time window', async () => {
      const evolution = await memory.getTopicEvolution('bitcoin', 2); // Last 2 days

      // Should only include narratives from last 2 days
      expect(evolution.dataPoints.length).toBeLessThanOrEqual(2);
    });

    it('handles topics with no history', async () => {
      const evolution = await memory.getTopicEvolution('unknown-topic', 30);

      expect(evolution.dataPoints.length).toBe(0);
      expect(evolution.subtopics.length).toBe(0);
      expect(evolution.subtopicCount).toBe(0);
    });
  });

  describe('_getSubtopicDistribution', () => {
    it('returns empty array for empty cluster', () => {
      const cluster = {
        subtopics: new Set(),
        entries: []
      };

      const distribution = memory._getSubtopicDistribution(cluster);
      expect(distribution).toEqual([]);
    });

    it('counts subtopic occurrences', () => {
      const cluster = {
        subtopics: new Set(['price', 'adoption']),
        entries: [
          { subtopic: 'price', timestamp: Date.now() },
          { subtopic: 'price', timestamp: Date.now() },
          { subtopic: 'adoption', timestamp: Date.now() },
          { subtopic: 'price', timestamp: Date.now() }
        ]
      };

      const distribution = memory._getSubtopicDistribution(cluster);
      
      expect(distribution.length).toBe(2);
      expect(distribution[0].subtopic).toBe('price');
      expect(distribution[0].count).toBe(3);
      expect(distribution[1].subtopic).toBe('adoption');
      expect(distribution[1].count).toBe(1);
    });

    it('sorts by count descending', () => {
      const cluster = {
        subtopics: new Set(['a', 'b', 'c']),
        entries: [
          { subtopic: 'a', timestamp: Date.now() },
          { subtopic: 'b', timestamp: Date.now() },
          { subtopic: 'b', timestamp: Date.now() },
          { subtopic: 'c', timestamp: Date.now() },
          { subtopic: 'c', timestamp: Date.now() },
          { subtopic: 'c', timestamp: Date.now() }
        ]
      };

      const distribution = memory._getSubtopicDistribution(cluster);
      
      expect(distribution[0].subtopic).toBe('c');
      expect(distribution[0].count).toBe(3);
      expect(distribution[1].subtopic).toBe('b');
      expect(distribution[1].count).toBe(2);
      expect(distribution[2].subtopic).toBe('a');
      expect(distribution[2].count).toBe(1);
    });

    it('limits to top 10 subtopics', () => {
      const entries = [];
      for (let i = 0; i < 15; i++) {
        entries.push({ subtopic: `subtopic-${i}`, timestamp: Date.now() });
      }

      const cluster = {
        subtopics: new Set(entries.map(e => e.subtopic)),
        entries
      };

      const distribution = memory._getSubtopicDistribution(cluster);
      expect(distribution.length).toBe(10);
    });
  });

  describe('topicClusters initialization', () => {
    it('initializes topicClusters as Map', () => {
      expect(memory.topicClusters).toBeInstanceOf(Map);
    });

    it('has maxClusterEntries configuration', () => {
      expect(memory.maxClusterEntries).toBeDefined();
      expect(typeof memory.maxClusterEntries).toBe('number');
      expect(memory.maxClusterEntries).toBeGreaterThan(0);
    });
  });
});
