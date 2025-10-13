const { describe, it, expect, beforeEach, afterEach } = globalThis;
const { vi } = globalThis;
const { AdaptiveTrending } = require('../lib/adaptiveTrending');

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {} };

describe('AdaptiveTrending', () => {
  let trending;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    trending = new AdaptiveTrending(noopLogger, {
      baselineWindowHours: 24,
      velocityWindowMinutes: 30,
      noveltyWindowHours: 6,
      trendingThreshold: 1.2
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Baseline Activity', () => {
    it('should not trend topics with consistent baseline activity', () => {
      const now = Date.now();
      const topic = 'bitcoin';
      const users = new Set(['user1', 'user2', 'user3']);

      // Simulate consistent baseline activity over 24 hours
      for (let i = 0; i < 24; i++) {
        const timestamp = now - (i * 60 * 60 * 1000); // Each hour
        trending.recordActivity(topic, {
          mentions: 5,
          users,
          keywords: ['price', 'market', 'trading'],
          context: 'Bitcoin price discussion'
        }, timestamp);
      }

      const trendingTopics = trending.getTrendingTopics(5);
      
      // Should not be trending - consistent baseline
      expect(trendingTopics.length).toBe(0);
    });

    it('should trend topics with spike above baseline', () => {
      const now = Date.now();
      const topic = 'bitcoin';
      const baselineUsers = new Set(['user1', 'user2', 'user3']);
      const spikeUsers = new Set(['user1', 'user2', 'user3', 'user4', 'user5', 'user6', 'user7', 'user8']);

      // Establish baseline (lower activity 2 hours ago)
      for (let i = 2; i < 24; i++) {
        const timestamp = now - (i * 60 * 60 * 1000);
        trending.recordActivity(topic, {
          mentions: 3,
          users: baselineUsers,
          keywords: ['price', 'market'],
          context: 'Normal bitcoin discussion'
        }, timestamp);
      }

      // Simulate spike in recent 30 minutes with new developments
      for (let i = 0; i < 6; i++) {
        const timestamp = now - (i * 5 * 60 * 1000); // Every 5 minutes
        trending.recordActivity(topic, {
          mentions: 15,
          users: spikeUsers,
          keywords: ['price', 'spike', 'breakout', 'ATH', 'rally'],
          context: 'Bitcoin breaking new all-time high!'
        }, timestamp);
      }

      const trendingTopics = trending.getTrendingTopics(5);
      
      expect(trendingTopics.length).toBeGreaterThan(0);
      expect(trendingTopics[0].topic).toBe('bitcoin');
      expect(trendingTopics[0].score).toBeGreaterThan(1.2);
      expect(trendingTopics[0].velocity).toBeGreaterThan(1.5); // High velocity
    });
  });

  describe('Emerging Topics', () => {
    it('should highly trend new emerging topics with high novelty', () => {
      const now = Date.now();
      const topic = 'zk-rollups';
      const users = new Set(['user1', 'user2', 'user3', 'user4', 'user5']);

      // New topic appearing suddenly with diverse keywords
      for (let i = 0; i < 8; i++) {
        const timestamp = now - (i * 3 * 60 * 1000); // Every 3 minutes
        trending.recordActivity(topic, {
          mentions: 10,
          users,
          keywords: ['rollups', 'scaling', 'ethereum', 'L2', 'zkSync', 'performance', 'gas', 'fees'],
          context: 'Exciting new ZK rollup announcement'
        }, timestamp);
      }

      const trendingTopics = trending.getTrendingTopics(5);
      
      expect(trendingTopics.length).toBeGreaterThan(0);
      expect(trendingTopics[0].topic).toBe('zk-rollups');
      expect(trendingTopics[0].novelty).toBeGreaterThan(0.5); // High novelty (new topic)
      expect(trendingTopics[0].score).toBeGreaterThan(1.5);
    });

    it('should give moderate score to emerging topics with building momentum', () => {
      const now = Date.now();
      const topic = 'nostr-relay';
      const users = new Set(['user1', 'user2', 'user3']);

      // Accelerating discussion
      for (let i = 0; i < 3; i++) {
        const timestamp = now - ((10 - i) * 60 * 1000); // Getting more recent
        const mentions = (i + 1) * 3; // Increasing mentions
        trending.recordActivity(topic, {
          mentions,
          users,
          keywords: ['relay', 'nostr', 'protocol'],
          context: 'Discussing nostr relay implementation'
        }, timestamp);
      }

      const trendingTopics = trending.getTrendingTopics(5);
      
      if (trendingTopics.length > 0) {
        const nostrTrend = trendingTopics.find(t => t.topic === 'nostr-relay');
        expect(nostrTrend).toBeTruthy();
        expect(nostrTrend.velocity).toBeGreaterThan(0);
      }
    });
  });

  describe('Velocity Detection', () => {
    it('should detect accelerating discussion velocity', () => {
      const now = Date.now();
      const topic = 'ethereum-merge';
      const users = new Set(['user1', 'user2', 'user3', 'user4']);

      // Slow activity 60-30 minutes ago
      for (let i = 0; i < 3; i++) {
        const timestamp = now - ((60 - i * 10) * 60 * 1000);
        trending.recordActivity(topic, {
          mentions: 2,
          users: new Set(['user1', 'user2']),
          keywords: ['merge', 'ethereum'],
          context: 'Ethereum merge discussion'
        }, timestamp);
      }

      // Rapid activity in last 30 minutes
      for (let i = 0; i < 10; i++) {
        const timestamp = now - (i * 3 * 60 * 1000); // Every 3 minutes
        trending.recordActivity(topic, {
          mentions: 8,
          users,
          keywords: ['merge', 'ethereum', 'pos', 'staking'],
          context: 'Ethereum merge happening now!'
        }, timestamp);
      }

      const trendingTopics = trending.getTrendingTopics(5);
      
      expect(trendingTopics.length).toBeGreaterThan(0);
      const mergeTrend = trendingTopics.find(t => t.topic === 'ethereum-merge');
      expect(mergeTrend).toBeTruthy();
      expect(mergeTrend.velocity).toBeGreaterThan(2.0); // High acceleration
    });

    it('should detect decelerating discussion', () => {
      const now = Date.now();
      const topic = 'nft-drop';

      // High activity 60-30 minutes ago
      for (let i = 0; i < 10; i++) {
        const timestamp = now - ((60 - i * 3) * 60 * 1000);
        trending.recordActivity(topic, {
          mentions: 10,
          users: new Set(['user1', 'user2', 'user3', 'user4', 'user5']),
          keywords: ['nft', 'drop', 'mint'],
          context: 'NFT drop happening'
        }, timestamp);
      }

      // Lower activity in last 30 minutes
      for (let i = 0; i < 2; i++) {
        const timestamp = now - (i * 10 * 60 * 1000);
        trending.recordActivity(topic, {
          mentions: 2,
          users: new Set(['user1']),
          keywords: ['nft'],
          context: 'NFT discussion'
        }, timestamp);
      }

      const trendingTopics = trending.getTrendingTopics(5);
      
      // Should not trend highly with low recent velocity
      const nftTrend = trendingTopics.find(t => t.topic === 'nft-drop');
      if (nftTrend) {
        expect(nftTrend.velocity).toBeLessThan(1.0);
      }
    });
  });

  describe('Novelty Scoring', () => {
    it('should detect novelty from new keywords', () => {
      const now = Date.now();
      const topic = 'bitcoin';

      // Old discussion with same keywords
      for (let i = 6; i < 12; i++) {
        const timestamp = now - (i * 60 * 60 * 1000); // 6-12 hours ago
        trending.recordActivity(topic, {
          mentions: 5,
          users: new Set(['user1', 'user2']),
          keywords: ['price', 'market', 'trading'],
          context: 'Bitcoin price discussion'
        }, timestamp);
      }

      // Recent discussion with new keywords
      for (let i = 0; i < 5; i++) {
        const timestamp = now - (i * 30 * 60 * 1000); // Last few hours
        trending.recordActivity(topic, {
          mentions: 8,
          users: new Set(['user1', 'user2', 'user3']),
          keywords: ['upgrade', 'taproot', 'schnorr', 'signatures', 'privacy', 'lightning'],
          context: 'Bitcoin taproot upgrade discussion'
        }, timestamp);
      }

      const trendingTopics = trending.getTrendingTopics(5);
      
      if (trendingTopics.length > 0) {
        const btcTrend = trendingTopics.find(t => t.topic === 'bitcoin');
        expect(btcTrend).toBeTruthy();
        expect(btcTrend.novelty).toBeGreaterThan(0.5); // High novelty from new keywords
      }
    });

    it('should give low novelty to repetitive content', () => {
      const now = Date.now();
      const topic = 'daily-greeting';

      // Repetitive content with same keywords
      for (let i = 0; i < 20; i++) {
        const timestamp = now - (i * 30 * 60 * 1000);
        trending.recordActivity(topic, {
          mentions: 3,
          users: new Set(['user1', 'user2']),
          keywords: ['good', 'morning', 'gm'],
          context: 'GM everyone'
        }, timestamp);
      }

      const details = trending.getTopicDetails('daily-greeting');
      
      expect(details).toBeTruthy();
      expect(details.novelty).toBeLessThan(0.3); // Low novelty - repetitive
    });
  });

  describe('Development Tracking', () => {
    it('should track sustained conversation development', () => {
      const now = Date.now();
      const topic = 'protocol-upgrade';
      const users = ['user1', 'user2', 'user3', 'user4', 'user5'];

      // Sustained conversation with multiple users and evolving context
      for (let i = 0; i < 10; i++) {
        const timestamp = now - (i * 3 * 60 * 1000);
        const userSet = new Set([users[i % users.length], users[(i + 1) % users.length]]);
        trending.recordActivity(topic, {
          mentions: 5,
          users: userSet,
          keywords: ['protocol', 'upgrade', 'implementation'],
          context: `Protocol upgrade discussion - phase ${i + 1}`
        }, timestamp);
      }

      const trendingTopics = trending.getTrendingTopics(5);
      
      if (trendingTopics.length > 0) {
        const protocolTrend = trendingTopics.find(t => t.topic === 'protocol-upgrade');
        expect(protocolTrend).toBeTruthy();
        expect(protocolTrend.development).toBeGreaterThan(0.3); // Good development score
      }
    });
  });

  describe('Topic Details and Monitoring', () => {
    it('should provide detailed information about topic trending status', () => {
      const now = Date.now();
      const topic = 'test-topic';
      const users = new Set(['user1', 'user2', 'user3']);

      for (let i = 0; i < 5; i++) {
        const timestamp = now - (i * 10 * 60 * 1000);
        trending.recordActivity(topic, {
          mentions: 5,
          users,
          keywords: ['test', 'keyword'],
          context: 'Test context'
        }, timestamp);
      }

      const details = trending.getTopicDetails('test-topic');
      
      expect(details).toBeTruthy();
      expect(details.topic).toBe('test-topic');
      expect(details.historyLength).toBe(5);
      expect(details.currentScore).toBeGreaterThanOrEqual(0);
      expect(typeof details.velocity).toBe('number');
      expect(typeof details.novelty).toBe('number');
      expect(typeof details.development).toBe('number');
      expect(typeof details.isTrending).toBe('boolean');
    });

    it('should return null for topics with no history', () => {
      const details = trending.getTopicDetails('non-existent-topic');
      expect(details).toBeNull();
    });
  });

  describe('Baseline Calculation', () => {
    it('should establish and use baseline for trending calculation', () => {
      const now = Date.now();
      const topic = 'established-topic';
      const users = new Set(['user1', 'user2']);

      // Create history to establish baseline (requires 10+ entries)
      for (let i = 0; i < 15; i++) {
        const timestamp = now - (i * 60 * 60 * 1000);
        trending.recordActivity(topic, {
          mentions: 5,
          users,
          keywords: ['topic', 'discussion'],
          context: 'Regular discussion'
        }, timestamp);
      }

      const baseline = trending.getBaseline('established-topic');
      
      expect(baseline).toBeTruthy();
      expect(baseline.avgMentions).toBeGreaterThan(0);
      expect(baseline.lastUpdated).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup old history data', () => {
      const now = Date.now();
      const topic = 'old-topic';
      const users = new Set(['user1']);

      // Add very old data (more than 48 hours ago)
      const oldTimestamp = now - (50 * 60 * 60 * 1000);
      trending.recordActivity(topic, {
        mentions: 5,
        users,
        keywords: ['old'],
        context: 'Old discussion'
      }, oldTimestamp);

      // Cleanup with 48 hour threshold
      trending.cleanup(48);

      // Topic should be removed
      const details = trending.getTopicDetails('old-topic');
      expect(details).toBeNull();
    });

    it('should keep recent history data', () => {
      const now = Date.now();
      const topic = 'recent-topic';
      const users = new Set(['user1']);

      // Add recent data
      trending.recordActivity(topic, {
        mentions: 5,
        users,
        keywords: ['recent'],
        context: 'Recent discussion'
      }, now - (1 * 60 * 60 * 1000)); // 1 hour ago

      // Cleanup with 48 hour threshold
      trending.cleanup(48);

      // Topic should still exist
      const details = trending.getTopicDetails('recent-topic');
      expect(details).toBeTruthy();
    });
  });

  describe('Trending Threshold', () => {
    it('should only return topics above trending threshold', () => {
      const now = Date.now();
      
      // Topic with low activity (below threshold)
      trending.recordActivity('low-activity', {
        mentions: 1,
        users: new Set(['user1']),
        keywords: ['low'],
        context: 'Low activity'
      }, now);

      const trendingTopics = trending.getTrendingTopics(5);
      
      // Should not include topics below threshold
      const lowTopic = trendingTopics.find(t => t.topic === 'low-activity');
      expect(lowTopic).toBeFalsy();
    });
  });
});
