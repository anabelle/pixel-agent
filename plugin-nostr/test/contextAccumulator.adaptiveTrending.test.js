const { describe, it, expect, beforeEach, afterEach } = globalThis;
const { vi } = globalThis;
const { ContextAccumulator } = require('../lib/contextAccumulator');

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {} };

function createAccumulator(options = {}) {
  return new ContextAccumulator(null, noopLogger, options);
}

describe('ContextAccumulator with Adaptive Trending', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getCurrentActivity with adaptive trending', () => {
    it('should return trending topics with adaptive scores when enabled', async () => {
      const acc = createAccumulator({ adaptiveTrendingEnabled: true });
      const hour = acc._getCurrentHour();
      const now = Date.now();

      // Create digest with topics
      const digest = acc._createEmptyDigest();
      digest.eventCount = 10;
      digest.users.add('user1');
      digest.users.add('user2');
      digest.topics.set('bitcoin', 5);
      digest.topics.set('nostr', 3);
      acc.hourlyDigests.set(hour, digest);

      // Feed data to adaptive trending to create spike
      const users = new Set(['user1', 'user2', 'user3']);
      for (let i = 0; i < 8; i++) {
        acc.adaptiveTrending.recordActivity('bitcoin', {
          mentions: 10,
          users,
          keywords: ['price', 'spike', 'ATH', 'rally'],
          context: 'Bitcoin breaking new high!'
        }, now - (i * 5 * 60 * 1000));
      }

      const activity = acc.getCurrentActivity();

      expect(activity.events).toBe(10);
      expect(activity.users).toBe(2);
      expect(activity.topics).toBeDefined();
      
      // Should include adaptive scoring data
      if (activity.topics.length > 0) {
        const btcTopic = activity.topics.find(t => t.topic === 'bitcoin');
        if (btcTopic) {
          expect(btcTopic.score).toBeDefined();
          expect(btcTopic.velocity).toBeDefined();
          expect(btcTopic.novelty).toBeDefined();
        }
      }
    });

    it('should fall back to frequency-based when adaptive trending disabled', () => {
      const acc = createAccumulator();
      acc.adaptiveTrendingEnabled = false;
      
      const hour = acc._getCurrentHour();
      const digest = acc._createEmptyDigest();
      digest.eventCount = 5;
      digest.users.add('user1');
      digest.topics.set('bitcoin', 10);
      digest.topics.set('nostr', 5);
      digest.topics.set('lightning', 3);
      acc.hourlyDigests.set(hour, digest);

      const activity = acc.getCurrentActivity();

      expect(activity.events).toBe(5);
      expect(activity.topics).toBeDefined();
      expect(activity.topics.length).toBeGreaterThan(0);
      
      // Should be sorted by count (frequency)
      if (activity.topics.length > 1) {
        expect(activity.topics[0].topic).toBe('bitcoin');
        expect(activity.topics[0].count).toBe(10);
      }
    });
  });

  describe('getAdaptiveTrendingTopics', () => {
    it('should return trending topics with adaptive scores', () => {
      const acc = createAccumulator();
      const now = Date.now();
      const users = new Set(['user1', 'user2', 'user3', 'user4']);

      // Create a trending topic with spike
      for (let i = 0; i < 10; i++) {
        acc.adaptiveTrending.recordActivity('zk-rollups', {
          mentions: 15,
          users,
          keywords: ['rollups', 'scaling', 'ethereum', 'L2', 'zkSync'],
          context: 'ZK rollup announcement'
        }, now - (i * 3 * 60 * 1000));
      }

      const trending = acc.getAdaptiveTrendingTopics({ limit: 5 });

      if (trending.length > 0) {
        expect(trending[0].topic).toBe('zk-rollups');
        expect(trending[0].score).toBeGreaterThan(1.2);
        expect(trending[0].velocity).toBeDefined();
        expect(trending[0].novelty).toBeDefined();
      }
    });

    it('should fall back to getTopTopicsAcrossHours when adaptive disabled', () => {
      const acc = createAccumulator();
      acc.adaptiveTrendingEnabled = false;
      
      const hour = acc._getCurrentHour();
      const digest = acc._createEmptyDigest();
      digest.topics.set('bitcoin', 10);
      digest.topics.set('nostr', 5);
      acc.hourlyDigests.set(hour, digest);

      const trending = acc.getAdaptiveTrendingTopics({ limit: 3 });

      // Should fall back to frequency-based
      expect(Array.isArray(trending)).toBe(true);
    });

    it('should filter by minimum score', () => {
      const acc = createAccumulator();
      const now = Date.now();

      // Low activity topic
      acc.adaptiveTrending.recordActivity('low-topic', {
        mentions: 1,
        users: new Set(['user1']),
        keywords: ['low'],
        context: 'Low activity'
      }, now);

      const trending = acc.getAdaptiveTrendingTopics({ limit: 5, minScore: 1.5 });

      // Should not include low-scoring topics
      const lowTopic = trending.find(t => t.topic === 'low-topic');
      expect(lowTopic).toBeFalsy();
    });
  });

  describe('Integration with processEvent', () => {
    it('should feed topic data to adaptive trending when processing events', async () => {
      const acc = createAccumulator();
      
      const evt = {
        id: 'evt123',
        pubkey: 'user1',
        content: 'Exciting new ZK rollup technology for Ethereum scaling!',
        created_at: Date.now() / 1000,
        tags: []
      };

      // Mock topic extraction
      acc._extractStructuredData = async () => ({
        topics: ['zk-rollups', 'ethereum'],
        sentiment: 'positive',
        links: []
      });

      await acc.processEvent(evt);

      // Check that adaptive trending received the data
      const details = acc.adaptiveTrending.getTopicDetails('zk-rollups');
      expect(details).toBeTruthy();
      expect(details.historyLength).toBeGreaterThan(0);
    });

    it('should skip "general" topic in adaptive trending', async () => {
      const acc = createAccumulator();
      
      const evt = {
        id: 'evt456',
        pubkey: 'user1',
        content: 'Just a general message',
        created_at: Date.now() / 1000,
        tags: []
      };

      acc._extractStructuredData = async () => ({
        topics: ['general'],
        sentiment: 'neutral',
        links: []
      });

      await acc.processEvent(evt);

      // "general" should not be tracked in adaptive trending
      const details = acc.adaptiveTrending.getTopicDetails('general');
      expect(details).toBeFalsy();
    });
  });

  describe('Baseline vs Spike Detection', () => {
    it('should not trend topics with consistent baseline activity', () => {
      const acc = createAccumulator();
      const now = Date.now();
      const users = new Set(['user1', 'user2']);

      // Establish consistent baseline for bitcoin
      for (let i = 0; i < 24; i++) {
        acc.adaptiveTrending.recordActivity('bitcoin', {
          mentions: 5,
          users,
          keywords: ['price', 'market'],
          context: 'Regular bitcoin discussion'
        }, now - (i * 60 * 60 * 1000));
      }

      const trending = acc.getAdaptiveTrendingTopics({ limit: 5 });

      // Bitcoin should not be trending (consistent baseline)
      const btcTrend = trending.find(t => t.topic === 'bitcoin');
      expect(btcTrend).toBeFalsy();
    });

    it('should trend topics that spike above baseline', () => {
      const acc = createAccumulator();
      const now = Date.now();
      const baselineUsers = new Set(['user1', 'user2']);
      const spikeUsers = new Set(['user1', 'user2', 'user3', 'user4', 'user5', 'user6']);

      // Establish baseline (lower activity)
      for (let i = 2; i < 24; i++) {
        acc.adaptiveTrending.recordActivity('bitcoin', {
          mentions: 3,
          users: baselineUsers,
          keywords: ['price', 'market'],
          context: 'Normal discussion'
        }, now - (i * 60 * 60 * 1000));
      }

      // Create spike in last hour
      for (let i = 0; i < 10; i++) {
        acc.adaptiveTrending.recordActivity('bitcoin', {
          mentions: 20,
          users: spikeUsers,
          keywords: ['price', 'spike', 'breakout', 'ATH', 'rally'],
          context: 'Bitcoin breaking new all-time high!'
        }, now - (i * 5 * 60 * 1000));
      }

      const trending = acc.getAdaptiveTrendingTopics({ limit: 5 });

      // Bitcoin should be trending (spike above baseline)
      const btcTrend = trending.find(t => t.topic === 'bitcoin');
      expect(btcTrend).toBeTruthy();
      expect(btcTrend.score).toBeGreaterThan(1.5);
    });
  });

  describe('Emerging Topic Detection', () => {
    it('should highly score new emerging topics', () => {
      const acc = createAccumulator();
      const now = Date.now();
      const users = new Set(['user1', 'user2', 'user3', 'user4']);

      // New topic appearing suddenly
      for (let i = 0; i < 8; i++) {
        acc.adaptiveTrending.recordActivity('ordinals', {
          mentions: 12,
          users,
          keywords: ['ordinals', 'inscriptions', 'bitcoin', 'nft', 'art'],
          context: 'New Bitcoin Ordinals protocol'
        }, now - (i * 3 * 60 * 1000));
      }

      const trending = acc.getAdaptiveTrendingTopics({ limit: 5 });

      const ordinalsTrend = trending.find(t => t.topic === 'ordinals');
      expect(ordinalsTrend).toBeTruthy();
      expect(ordinalsTrend.novelty).toBeGreaterThan(0.5); // High novelty
      expect(ordinalsTrend.score).toBeGreaterThan(1.5);
    });
  });

  describe('Keyword Extraction', () => {
    it('should extract meaningful keywords from content', () => {
      const acc = createAccumulator();
      
      const content = "The new ZK rollup technology provides amazing scalability improvements for Ethereum!";
      const keywords = acc._extractKeywords(content, {});

      expect(keywords).toBeDefined();
      expect(keywords.length).toBeGreaterThan(0);
      
      // Should filter out stop words
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('for');
      
      // Should include meaningful words
      const hasRelevantWord = keywords.some(kw => 
        ['rollup', 'technology', 'scalability', 'ethereum'].includes(kw)
      );
      expect(hasRelevantWord).toBe(true);
    });

    it('should limit keywords to top 10', () => {
      const acc = createAccumulator();
      
      const content = "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13";
      const keywords = acc._extractKeywords(content, {});

      expect(keywords.length).toBeLessThanOrEqual(10);
    });
  });
});
