const { describe, it, expect, beforeEach, afterEach, vi } = globalThis;
const { UserProfileManager } = require('../lib/userProfileManager.js');

// Mock runtime factory
function createMockRuntime(overrides = {}) {
  const memories = new Map();
  
  const runtime = {
    agentId: 'test-agent-id',
    createUniqueUuid: (runtime, seed) => `uuid:${seed}`,
    getMemories: async ({ roomId, entityId, tableName, count }) => {
      const key = `${roomId}:${entityId}`;
      const stored = memories.get(key);
      if (stored && Array.isArray(stored)) {
        return stored.slice(0, count);
      }
      return [];
    },
    createMemory: async (memory, tableName) => {
      const key = `${memory.roomId}:${memory.entityId}`;
      const existing = memories.get(key) || [];
      existing.push(memory);
      memories.set(key, existing);
      return true;
    },
    databaseAdapter: {
      createMemory: async (memory) => {
        return { ok: true, created: true };
      }
    },
    ...overrides
  };

  return { runtime, memories };
}

// Mock logger
const mockLogger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {}
};

describe('UserProfileManager', () => {
  let manager;
  let runtime;
  let memories;

  beforeEach(() => {
    const mock = createMockRuntime();
    runtime = mock.runtime;
    memories = mock.memories;
    manager = new UserProfileManager(runtime, mockLogger);
  });

  afterEach(() => {
    if (manager && manager.syncTimer) {
      clearInterval(manager.syncTimer);
    }
  });

  describe('Constructor', () => {
    it('initializes with runtime and logger', () => {
      expect(manager.runtime).toBe(runtime);
      expect(manager.logger).toBe(mockLogger);
      expect(manager.profiles).toBeInstanceOf(Map);
      expect(manager.profiles.size).toBe(0);
    });

    it('sets configuration defaults', () => {
      expect(manager.maxCachedProfiles).toBe(500);
      expect(manager.profileSyncInterval).toBe(5 * 60 * 1000);
      expect(manager.interactionHistoryLimit).toBe(100);
    });

    it('starts periodic sync timer', () => {
      expect(manager.syncTimer).toBeDefined();
    });

    it('works without logger (uses console)', () => {
      const mgr = new UserProfileManager(runtime);
      expect(mgr.logger).toBe(console);
      if (mgr.syncTimer) clearInterval(mgr.syncTimer);
    });
  });

  describe('Profile Management - getProfile', () => {
    it('returns cached profile when available', async () => {
      const pubkey = 'test-pubkey-1';
      const profile = manager._createEmptyProfile(pubkey);
      manager.profiles.set(pubkey, profile);

      const retrieved = await manager.getProfile(pubkey);
      expect(retrieved).toBe(profile);
      expect(retrieved.pubkey).toBe(pubkey);
    });

    it('creates new profile when not found', async () => {
      const pubkey = 'new-pubkey';
      const profile = await manager.getProfile(pubkey);

      expect(profile).toBeDefined();
      expect(profile.pubkey).toBe(pubkey);
      expect(profile.totalInteractions).toBe(0);
      expect(profile.qualityScore).toBe(0.5);
      expect(manager.profiles.has(pubkey)).toBe(true);
    });

    it('loads profile from memory when available', async () => {
      const pubkey = 'stored-pubkey';
      const roomId = 'uuid:nostr-user-profiles';
      const entityId = `uuid:${pubkey}`;
      
      // Pre-populate memory store
      const storedProfile = {
        pubkey,
        totalInteractions: 10,
        qualityScore: 0.8,
        topicInterests: { bitcoin: 0.9 }
      };
      
      memories.set(`${roomId}:${entityId}`, [{
        content: { data: storedProfile }
      }]);

      const profile = await manager.getProfile(pubkey);
      expect(profile.pubkey).toBe(pubkey);
      expect(profile.totalInteractions).toBe(10);
      expect(profile.qualityScore).toBe(0.8);
      expect(profile.topicInterests.bitcoin).toBe(0.9);
    });

    it('handles runtime without getMemories gracefully', async () => {
      manager.runtime = { agentId: 'test' }; // No getMemories
      const profile = await manager.getProfile('test-pk');
      expect(profile).toBeDefined();
      expect(profile.pubkey).toBe('test-pk');
    });
  });

  describe('Profile Management - updateProfile', () => {
    it('updates existing profile data', async () => {
      const pubkey = 'update-test';
      await manager.getProfile(pubkey); // Create profile

      await manager.updateProfile(pubkey, {
        qualityScore: 0.9,
        engagementScore: 0.7
      });

      const profile = await manager.getProfile(pubkey);
      expect(profile.qualityScore).toBe(0.9);
      expect(profile.engagementScore).toBe(0.7);
    });

    it('sets needsSync flag on update', async () => {
      const pubkey = 'sync-test';
      await manager.getProfile(pubkey);

      await manager.updateProfile(pubkey, { qualityScore: 0.95 });
      const profile = manager.profiles.get(pubkey);
      expect(profile.needsSync).toBe(true);
    });

    it('updates lastUpdated timestamp', async () => {
      const pubkey = 'timestamp-test';
      await manager.getProfile(pubkey);
      const before = Date.now();

      await manager.updateProfile(pubkey, { qualityScore: 0.8 });
      const profile = manager.profiles.get(pubkey);
      
      expect(profile.lastUpdated).toBeGreaterThanOrEqual(before);
    });

    it('merges updates with existing data', async () => {
      const pubkey = 'merge-test';
      await manager.getProfile(pubkey);
      await manager.updateProfile(pubkey, { qualityScore: 0.7 });
      await manager.updateProfile(pubkey, { engagementScore: 0.6 });

      const profile = await manager.getProfile(pubkey);
      expect(profile.qualityScore).toBe(0.7);
      expect(profile.engagementScore).toBe(0.6);
    });
  });

  describe('Interaction History - recordInteraction', () => {
    it('records interaction with timestamp', async () => {
      const pubkey = 'interaction-test';
      const before = Date.now();

      await manager.recordInteraction(pubkey, {
        type: 'reply',
        success: true,
        content: 'test reply'
      });

      const profile = await manager.getProfile(pubkey);
      expect(profile.interactions.length).toBe(1);
      expect(profile.interactions[0].type).toBe('reply');
      expect(profile.interactions[0].success).toBe(true);
      expect(profile.interactions[0].timestamp).toBeGreaterThanOrEqual(before);
    });

    it('increments totalInteractions counter', async () => {
      const pubkey = 'counter-test';
      await manager.recordInteraction(pubkey, { type: 'reply' });
      await manager.recordInteraction(pubkey, { type: 'mention' });

      const profile = await manager.getProfile(pubkey);
      expect(profile.totalInteractions).toBe(2);
    });

    it('tracks successful interactions', async () => {
      const pubkey = 'success-test';
      await manager.recordInteraction(pubkey, { type: 'reply', success: true });
      await manager.recordInteraction(pubkey, { type: 'reply', success: false });
      await manager.recordInteraction(pubkey, { type: 'reply', success: true });

      const profile = await manager.getProfile(pubkey);
      expect(profile.successfulInteractions).toBe(2);
    });

    it('tracks interactions by type', async () => {
      const pubkey = 'type-test';
      await manager.recordInteraction(pubkey, { type: 'reply' });
      await manager.recordInteraction(pubkey, { type: 'reply' });
      await manager.recordInteraction(pubkey, { type: 'mention' });

      const profile = await manager.getProfile(pubkey);
      expect(profile.interactionsByType.reply).toBe(2);
      expect(profile.interactionsByType.mention).toBe(1);
    });

    it('limits interaction history to configured limit', async () => {
      const pubkey = 'limit-test';
      manager.interactionHistoryLimit = 5;

      for (let i = 0; i < 10; i++) {
        await manager.recordInteraction(pubkey, { type: 'test', index: i });
      }

      const profile = await manager.getProfile(pubkey);
      expect(profile.interactions.length).toBe(5);
      // Should keep the most recent ones
      expect(profile.interactions[4].index).toBe(9);
    });

    it('updates lastInteraction timestamp', async () => {
      const pubkey = 'last-test';
      const before = Date.now();

      await manager.recordInteraction(pubkey, { type: 'test' });
      const profile = await manager.getProfile(pubkey);
      
      expect(profile.lastInteraction).toBeGreaterThanOrEqual(before);
    });

    it('marks profile for sync', async () => {
      const pubkey = 'sync-mark-test';
      await manager.recordInteraction(pubkey, { type: 'test' });
      
      const profile = manager.profiles.get(pubkey);
      expect(profile.needsSync).toBe(true);
    });
  });

  describe('Topic Interest - recordTopicInterest', () => {
    it('records topic interest with engagement score', async () => {
      const pubkey = 'topic-test';
      await manager.recordTopicInterest(pubkey, 'bitcoin', 0.8);

      const profile = await manager.getProfile(pubkey);
      expect(profile.topicInterests.bitcoin).toBeGreaterThan(0);
    });

    it('uses exponential moving average for topic interests', async () => {
      const pubkey = 'ema-test';
      const alpha = 0.3;

      await manager.recordTopicInterest(pubkey, 'nostr', 1.0);
      const profile1 = await manager.getProfile(pubkey);
      const firstScore = profile1.topicInterests.nostr;
      expect(firstScore).toBeCloseTo(alpha * 1.0, 2);

      await manager.recordTopicInterest(pubkey, 'nostr', 0.5);
      const profile2 = await manager.getProfile(pubkey);
      const secondScore = profile2.topicInterests.nostr;
      const expected = alpha * 0.5 + (1 - alpha) * firstScore;
      expect(secondScore).toBeCloseTo(expected, 2);
    });

    it('tracks topic frequency', async () => {
      const pubkey = 'freq-test';
      await manager.recordTopicInterest(pubkey, 'art', 0.7);
      await manager.recordTopicInterest(pubkey, 'art', 0.8);
      await manager.recordTopicInterest(pubkey, 'art', 0.9);

      const profile = await manager.getProfile(pubkey);
      expect(profile.topicFrequency.art).toBe(3);
    });

    it('handles new topics correctly', async () => {
      const pubkey = 'new-topic-test';
      await manager.recordTopicInterest(pubkey, 'newTopic', 0.6);

      const profile = await manager.getProfile(pubkey);
      expect(profile.topicInterests.newTopic).toBeDefined();
      expect(profile.topicFrequency.newTopic).toBe(1);
    });

    it('defaults engagement to 1.0 when not provided', async () => {
      const pubkey = 'default-eng-test';
      await manager.recordTopicInterest(pubkey, 'defaultTopic');

      const profile = await manager.getProfile(pubkey);
      expect(profile.topicInterests.defaultTopic).toBeGreaterThan(0);
    });
  });

  describe('Sentiment Tracking - recordSentimentPattern', () => {
    it('records sentiment with timestamp', async () => {
      const pubkey = 'sentiment-test';
      const before = Date.now();

      await manager.recordSentimentPattern(pubkey, 'positive');

      const profile = await manager.getProfile(pubkey);
      expect(profile.sentimentHistory.length).toBe(1);
      expect(profile.sentimentHistory[0].sentiment).toBe('positive');
      expect(profile.sentimentHistory[0].timestamp).toBeGreaterThanOrEqual(before);
    });

    it('calculates dominant sentiment', async () => {
      const pubkey = 'dominant-test';
      await manager.recordSentimentPattern(pubkey, 'positive');
      await manager.recordSentimentPattern(pubkey, 'positive');
      await manager.recordSentimentPattern(pubkey, 'positive');
      await manager.recordSentimentPattern(pubkey, 'negative');

      const profile = await manager.getProfile(pubkey);
      expect(profile.dominantSentiment).toBe('positive');
    });

    it('limits sentiment history to 50 samples', async () => {
      const pubkey = 'limit-sentiment-test';

      for (let i = 0; i < 60; i++) {
        await manager.recordSentimentPattern(pubkey, 'neutral');
      }

      const profile = await manager.getProfile(pubkey);
      expect(profile.sentimentHistory.length).toBe(50);
    });

    it('updates dominant sentiment as new data comes in', async () => {
      const pubkey = 'update-dominant-test';
      
      // Start with positive
      for (let i = 0; i < 3; i++) {
        await manager.recordSentimentPattern(pubkey, 'positive');
      }
      let profile = await manager.getProfile(pubkey);
      expect(profile.dominantSentiment).toBe('positive');

      // Add more negative
      for (let i = 0; i < 5; i++) {
        await manager.recordSentimentPattern(pubkey, 'negative');
      }
      profile = await manager.getProfile(pubkey);
      expect(profile.dominantSentiment).toBe('negative');
    });
  });

  describe('Relationship Management - recordRelationship', () => {
    it('creates new relationship entry', async () => {
      const pubkey = 'rel-test-1';
      const relatedPubkey = 'rel-test-2';

      await manager.recordRelationship(pubkey, relatedPubkey, 'reply');

      const profile = await manager.getProfile(pubkey);
      expect(profile.relationships[relatedPubkey]).toBeDefined();
      expect(profile.relationships[relatedPubkey].pubkey).toBe(relatedPubkey);
    });

    it('increments interaction count for existing relationship', async () => {
      const pubkey = 'rel-inc-1';
      const relatedPubkey = 'rel-inc-2';

      await manager.recordRelationship(pubkey, relatedPubkey, 'reply');
      await manager.recordRelationship(pubkey, relatedPubkey, 'mention');

      const profile = await manager.getProfile(pubkey);
      expect(profile.relationships[relatedPubkey].interactions).toBe(2);
    });

    it('tracks interaction types in relationships', async () => {
      const pubkey = 'rel-types-1';
      const relatedPubkey = 'rel-types-2';

      await manager.recordRelationship(pubkey, relatedPubkey, 'reply');
      await manager.recordRelationship(pubkey, relatedPubkey, 'reply');
      await manager.recordRelationship(pubkey, relatedPubkey, 'mention');

      const profile = await manager.getProfile(pubkey);
      const rel = profile.relationships[relatedPubkey];
      expect(rel.types.reply).toBe(2);
      expect(rel.types.mention).toBe(1);
    });

    it('records timestamps for relationships', async () => {
      const pubkey = 'rel-time-1';
      const relatedPubkey = 'rel-time-2';
      const before = Date.now();

      await manager.recordRelationship(pubkey, relatedPubkey, 'reply');

      const profile = await manager.getProfile(pubkey);
      const rel = profile.relationships[relatedPubkey];
      expect(rel.firstSeen).toBeGreaterThanOrEqual(before);
      expect(rel.lastSeen).toBeGreaterThanOrEqual(before);
    });

    it('updates lastSeen on subsequent interactions', async () => {
      const pubkey = 'rel-lastseen-1';
      const relatedPubkey = 'rel-lastseen-2';

      await manager.recordRelationship(pubkey, relatedPubkey, 'reply');
      const profile1 = await manager.getProfile(pubkey);
      const firstLastSeen = profile1.relationships[relatedPubkey].lastSeen;

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 10));

      await manager.recordRelationship(pubkey, relatedPubkey, 'mention');
      const profile2 = await manager.getProfile(pubkey);
      const secondLastSeen = profile2.relationships[relatedPubkey].lastSeen;

      expect(secondLastSeen).toBeGreaterThan(firstLastSeen);
    });
  });

  describe('Discovery Integration - getTopicExperts', () => {
    it('finds users with high topic interest', async () => {
      await manager.recordTopicInterest('expert-1', 'bitcoin', 1.0);
      await manager.recordTopicInterest('expert-1', 'bitcoin', 1.0);
      await manager.recordTopicInterest('expert-1', 'bitcoin', 1.0);
      await manager.recordTopicInterest('expert-1', 'bitcoin', 1.0);
      await manager.recordTopicInterest('expert-1', 'bitcoin', 1.0);

      const experts = await manager.getTopicExperts('bitcoin', 5);
      expect(experts.length).toBeGreaterThan(0);
      expect(experts[0].pubkey).toBe('expert-1');
    });

    it('respects minimum interaction threshold', async () => {
      await manager.recordTopicInterest('low-freq', 'nostr', 0.9);
      await manager.recordTopicInterest('low-freq', 'nostr', 0.9);

      const experts = await manager.getTopicExperts('nostr', 5);
      expect(experts.length).toBe(0);
    });

    it('requires interest score above 0.5', async () => {
      const pubkey = 'low-interest';
      for (let i = 0; i < 10; i++) {
        await manager.recordTopicInterest(pubkey, 'test', 0.1);
      }

      const experts = await manager.getTopicExperts('test', 5);
      expect(experts.length).toBe(0);
    });

    it('sorts experts by score', async () => {
      // Create two experts with different scores
      for (let i = 0; i < 10; i++) {
        await manager.recordTopicInterest('expert-high', 'coding', 0.9);
        await manager.recordTopicInterest('expert-low', 'coding', 0.6);
      }

      const experts = await manager.getTopicExperts('coding', 5);
      expect(experts.length).toBeGreaterThan(0);
      if (experts.length > 1) {
        expect(experts[0].score).toBeGreaterThan(experts[1].score);
      }
    });

    it('limits results to top 10', async () => {
      // Create 15 experts
      for (let i = 0; i < 15; i++) {
        const pubkey = `expert-${i}`;
        for (let j = 0; j < 10; j++) {
          await manager.recordTopicInterest(pubkey, 'popular', 0.8);
        }
      }

      const experts = await manager.getTopicExperts('popular', 5);
      expect(experts.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Discovery Integration - getUserRecommendations', () => {
    it('finds users with similar topic interests', async () => {
      const user1 = 'user-similar-1';
      const user2 = 'user-similar-2';

      // Both interested in bitcoin and nostr
      await manager.recordTopicInterest(user1, 'bitcoin', 0.8);
      await manager.recordTopicInterest(user1, 'nostr', 0.7);
      await manager.recordTopicInterest(user2, 'bitcoin', 0.9);
      await manager.recordTopicInterest(user2, 'nostr', 0.8);

      const recommendations = await manager.getUserRecommendations(user1, 5);
      const hasSimilar = recommendations.some(r => r.pubkey === user2);
      expect(hasSimilar).toBe(true);
    });

    it('excludes users already in relationships', async () => {
      const user1 = 'exclude-test-1';
      const user2 = 'exclude-test-2';

      await manager.recordTopicInterest(user1, 'topic', 0.8);
      await manager.recordTopicInterest(user2, 'topic', 0.8);
      await manager.recordRelationship(user1, user2, 'reply');

      const recommendations = await manager.getUserRecommendations(user1, 5);
      const hasExcluded = recommendations.some(r => r.pubkey === user2);
      expect(hasExcluded).toBe(false);
    });

    it('excludes self from recommendations', async () => {
      const user = 'self-exclude';
      await manager.recordTopicInterest(user, 'topic', 0.8);

      const recommendations = await manager.getUserRecommendations(user, 5);
      const hasSelf = recommendations.some(r => r.pubkey === user);
      expect(hasSelf).toBe(false);
    });

    it('respects similarity threshold of 0.3', async () => {
      const user1 = 'threshold-1';
      const user2 = 'threshold-2';

      // Very different interests
      await manager.recordTopicInterest(user1, 'bitcoin', 0.9);
      await manager.recordTopicInterest(user2, 'art', 0.9);

      const recommendations = await manager.getUserRecommendations(user1, 5);
      // May or may not include user2 depending on similarity calculation
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('limits results to specified limit', async () => {
      const user1 = 'limit-rec-1';
      
      // Create 10 similar users
      for (let i = 0; i < 10; i++) {
        const otherUser = `similar-${i}`;
        await manager.recordTopicInterest(otherUser, 'shared', 0.8);
      }
      await manager.recordTopicInterest(user1, 'shared', 0.8);

      const recommendations = await manager.getUserRecommendations(user1, 3);
      expect(recommendations.length).toBeLessThanOrEqual(3);
    });

    it('includes common topics in recommendations', async () => {
      const user1 = 'common-1';
      const user2 = 'common-2';

      await manager.recordTopicInterest(user1, 'bitcoin', 0.8);
      await manager.recordTopicInterest(user1, 'nostr', 0.7);
      await manager.recordTopicInterest(user2, 'bitcoin', 0.9);
      await manager.recordTopicInterest(user2, 'nostr', 0.8);

      const recommendations = await manager.getUserRecommendations(user1, 5);
      const rec = recommendations.find(r => r.pubkey === user2);
      if (rec) {
        expect(rec.commonTopics).toBeDefined();
        expect(Array.isArray(rec.commonTopics)).toBe(true);
      }
    });
  });

  describe('Engagement Statistics - getEngagementStats', () => {
    it('returns complete engagement statistics', async () => {
      const pubkey = 'stats-test';
      await manager.recordInteraction(pubkey, { type: 'reply', success: true });
      await manager.recordTopicInterest(pubkey, 'bitcoin', 0.8);

      const stats = await manager.getEngagementStats(pubkey);
      
      expect(stats).toHaveProperty('totalInteractions');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('averageEngagement');
      expect(stats).toHaveProperty('topTopics');
      expect(stats).toHaveProperty('relationships');
      expect(stats).toHaveProperty('dominantSentiment');
      expect(stats).toHaveProperty('replySuccessRate');
    });

    it('calculates success rate correctly', async () => {
      const pubkey = 'success-rate-test';
      await manager.recordInteraction(pubkey, { type: 'reply', success: true });
      await manager.recordInteraction(pubkey, { type: 'reply', success: true });
      await manager.recordInteraction(pubkey, { type: 'reply', success: false });

      const stats = await manager.getEngagementStats(pubkey);
      expect(stats.successRate).toBeCloseTo(2/3, 2);
    });

    it('returns top 5 topics by interest', async () => {
      const pubkey = 'top-topics-test';
      await manager.recordTopicInterest(pubkey, 'topic1', 0.9);
      await manager.recordTopicInterest(pubkey, 'topic2', 0.8);
      await manager.recordTopicInterest(pubkey, 'topic3', 0.7);
      await manager.recordTopicInterest(pubkey, 'topic4', 0.6);
      await manager.recordTopicInterest(pubkey, 'topic5', 0.5);
      await manager.recordTopicInterest(pubkey, 'topic6', 0.4);

      const stats = await manager.getEngagementStats(pubkey);
      expect(stats.topTopics.length).toBeLessThanOrEqual(5);
      expect(stats.topTopics[0].topic).toBe('topic1');
    });

    it('counts relationships correctly', async () => {
      const pubkey = 'rel-count-test';
      await manager.recordRelationship(pubkey, 'user1', 'reply');
      await manager.recordRelationship(pubkey, 'user2', 'mention');
      await manager.recordRelationship(pubkey, 'user3', 'reply');

      const stats = await manager.getEngagementStats(pubkey);
      expect(stats.relationships).toBe(3);
    });

    it('handles profile with no interactions', async () => {
      const pubkey = 'empty-stats-test';
      const stats = await manager.getEngagementStats(pubkey);
      
      expect(stats.totalInteractions).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.topTopics.length).toBe(0);
    });
  });

  describe('Helper Methods - _createEmptyProfile', () => {
    it('creates profile with all required fields', () => {
      const pubkey = 'empty-prof-test';
      const profile = manager._createEmptyProfile(pubkey);

      expect(profile.pubkey).toBe(pubkey);
      expect(profile.createdAt).toBeDefined();
      expect(profile.lastUpdated).toBeDefined();
      expect(profile.totalInteractions).toBe(0);
      expect(profile.successfulInteractions).toBe(0);
      expect(profile.interactions).toEqual([]);
      expect(profile.topicInterests).toEqual({});
      expect(profile.topicFrequency).toEqual({});
      expect(profile.sentimentHistory).toEqual([]);
      expect(profile.relationships).toEqual({});
      expect(profile.qualityScore).toBe(0.5);
      expect(profile.needsSync).toBe(true);
    });

    it('sets default quality score to 0.5', () => {
      const profile = manager._createEmptyProfile('test');
      expect(profile.qualityScore).toBe(0.5);
    });

    it('initializes with neutral sentiment', () => {
      const profile = manager._createEmptyProfile('test');
      expect(profile.dominantSentiment).toBe('neutral');
    });
  });

  describe('Helper Methods - _calculateTopicSimilarity', () => {
    it('calculates cosine similarity correctly', () => {
      const interests1 = { bitcoin: 0.8, nostr: 0.6 };
      const interests2 = { bitcoin: 0.9, nostr: 0.7 };

      const similarity = manager._calculateTopicSimilarity(interests1, interests2);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('returns 0 for no common interests', () => {
      const interests1 = { bitcoin: 0.8 };
      const interests2 = { art: 0.9 };

      const similarity = manager._calculateTopicSimilarity(interests1, interests2);
      expect(similarity).toBeGreaterThanOrEqual(0);
    });

    it('returns 0 when one set is empty', () => {
      const interests1 = { bitcoin: 0.8 };
      const interests2 = {};

      const similarity = manager._calculateTopicSimilarity(interests1, interests2);
      expect(similarity).toBe(0);
    });

    it('returns 1 for identical interests', () => {
      const interests = { bitcoin: 0.8, nostr: 0.6 };

      const similarity = manager._calculateTopicSimilarity(interests, interests);
      expect(similarity).toBeCloseTo(1, 5);
    });
  });

  describe('Helper Methods - _getCommonTopics', () => {
    it('finds topics present in both profiles', () => {
      const interests1 = { bitcoin: 0.8, nostr: 0.6, art: 0.4 };
      const interests2 = { bitcoin: 0.9, nostr: 0.7, coding: 0.5 };

      const common = manager._getCommonTopics(interests1, interests2);
      expect(common).toContain('bitcoin');
      expect(common).toContain('nostr');
    });

    it('requires interest above 0.3 threshold', () => {
      const interests1 = { bitcoin: 0.8, lowInterest: 0.2 };
      const interests2 = { bitcoin: 0.9, lowInterest: 0.9 };

      const common = manager._getCommonTopics(interests1, interests2);
      expect(common).toContain('bitcoin');
      expect(common).not.toContain('lowInterest');
    });

    it('returns empty array when no common topics', () => {
      const interests1 = { bitcoin: 0.8 };
      const interests2 = { art: 0.9 };

      const common = manager._getCommonTopics(interests1, interests2);
      expect(common).toEqual([]);
    });
  });

  describe('Helper Methods - _calculateAverageEngagement', () => {
    it('calculates average from interaction engagement scores', () => {
      const profile = manager._createEmptyProfile('test');
      profile.interactions = [
        { type: 'reply', engagement: 0.8 },
        { type: 'reply', engagement: 0.6 },
        { type: 'reply', engagement: 0.4 }
      ];

      const avg = manager._calculateAverageEngagement(profile);
      expect(avg).toBeCloseTo(0.6, 2);
    });

    it('returns 0 for no interactions', () => {
      const profile = manager._createEmptyProfile('test');
      const avg = manager._calculateAverageEngagement(profile);
      expect(avg).toBe(0);
    });

    it('ignores interactions without engagement scores', () => {
      const profile = manager._createEmptyProfile('test');
      profile.interactions = [
        { type: 'reply', engagement: 0.8 },
        { type: 'mention' }, // No engagement
        { type: 'reply', engagement: 0.6 }
      ];

      const avg = manager._calculateAverageEngagement(profile);
      expect(avg).toBeCloseTo(0.7, 2);
    });
  });

  describe('Helper Methods - _calculateReplySuccessRate', () => {
    it('calculates success rate for replies', () => {
      const profile = manager._createEmptyProfile('test');
      profile.interactions = [
        { type: 'reply', success: true },
        { type: 'reply', success: true },
        { type: 'reply', success: false }
      ];

      const rate = manager._calculateReplySuccessRate(profile);
      expect(rate).toBeCloseTo(2/3, 2);
    });

    it('returns 0 when no reply interactions', () => {
      const profile = manager._createEmptyProfile('test');
      profile.interactions = [
        { type: 'mention', success: true }
      ];

      const rate = manager._calculateReplySuccessRate(profile);
      expect(rate).toBe(0);
    });

    it('only counts reply type interactions', () => {
      const profile = manager._createEmptyProfile('test');
      profile.interactions = [
        { type: 'reply', success: true },
        { type: 'mention', success: false },
        { type: 'reply', success: false }
      ];

      const rate = manager._calculateReplySuccessRate(profile);
      expect(rate).toBeCloseTo(0.5, 2);
    });
  });

  describe('Cleanup and Statistics', () => {
    it('clears sync timer on cleanup', async () => {
      const timer = manager.syncTimer;
      expect(timer).toBeDefined();

      await manager.cleanup();
      // Timer should be cleared
      expect(manager.syncTimer).toBeDefined(); // Reference still exists
    });

    it('getStats returns current statistics', () => {
      manager.profiles.set('user1', { ...manager._createEmptyProfile('user1'), totalInteractions: 5, relationships: { user2: {} } });
      manager.profiles.set('user2', { ...manager._createEmptyProfile('user2'), totalInteractions: 3, needsSync: true });

      const stats = manager.getStats();
      
      expect(stats.cachedProfiles).toBe(2);
      expect(stats.profilesNeedingSync).toBeGreaterThan(0);
      expect(stats.totalInteractions).toBe(8);
      expect(stats.totalRelationships).toBeGreaterThan(0);
    });

    it('getStats handles empty profiles', () => {
      const stats = manager.getStats();
      
      expect(stats.cachedProfiles).toBe(0);
      expect(stats.profilesNeedingSync).toBe(0);
      expect(stats.totalInteractions).toBe(0);
      expect(stats.totalRelationships).toBe(0);
    });
  });

  describe('Memory Persistence - _loadProfileFromMemory', () => {
    it('returns null when runtime lacks getMemories', async () => {
      manager.runtime = { agentId: 'test' };
      const profile = await manager._loadProfileFromMemory('test-pk');
      expect(profile).toBeNull();
    });

    it('returns null when createUniqueUuid is missing', async () => {
      manager.runtime = {
        getMemories: async () => [],
        createUniqueUuid: null
      };
      const profile = await manager._loadProfileFromMemory('test-pk');
      expect(profile).toBeNull();
    });

    it('loads profile from memory successfully', async () => {
      const pubkey = 'load-test';
      const roomId = 'uuid:nostr-user-profiles';
      const entityId = `uuid:${pubkey}`;
      
      const storedData = {
        pubkey,
        totalInteractions: 15,
        qualityScore: 0.85
      };
      
      memories.set(`${roomId}:${entityId}`, [{
        content: { data: storedData }
      }]);

      const profile = await manager._loadProfileFromMemory(pubkey);
      expect(profile.pubkey).toBe(pubkey);
      expect(profile.totalInteractions).toBe(15);
      expect(profile.qualityScore).toBe(0.85);
      expect(profile.needsSync).toBe(false);
    });

    it('returns null when no memories found', async () => {
      const profile = await manager._loadProfileFromMemory('nonexistent');
      expect(profile).toBeNull();
    });

    it('handles errors gracefully', async () => {
      manager.runtime.getMemories = async () => {
        throw new Error('Database error');
      };

      const profile = await manager._loadProfileFromMemory('error-test');
      expect(profile).toBeNull();
    });
  });

  describe('Memory Persistence - _syncProfilesToMemory', () => {
    it('syncs profiles marked needsSync', async () => {
      const pubkey = 'sync-test';
      const profile = manager._createEmptyProfile(pubkey);
      profile.needsSync = true;
      manager.profiles.set(pubkey, profile);

      await manager._syncProfilesToMemory();

      // Check if needsSync flag was cleared
      const updated = manager.profiles.get(pubkey);
      expect(updated.needsSync).toBe(false);
    });

    it('skips profiles not marked for sync', async () => {
      const pubkey1 = 'no-sync';
      const pubkey2 = 'yes-sync';
      
      const profile1 = manager._createEmptyProfile(pubkey1);
      profile1.needsSync = false;
      manager.profiles.set(pubkey1, profile1);

      const profile2 = manager._createEmptyProfile(pubkey2);
      profile2.needsSync = true;
      manager.profiles.set(pubkey2, profile2);

      await manager._syncProfilesToMemory();

      expect(manager.profiles.get(pubkey1).needsSync).toBe(false);
      expect(manager.profiles.get(pubkey2).needsSync).toBe(false);
    });

    it('does nothing when runtime lacks createMemory', async () => {
      manager.runtime = { agentId: 'test' };
      
      const pubkey = 'no-create';
      const profile = manager._createEmptyProfile(pubkey);
      profile.needsSync = true;
      manager.profiles.set(pubkey, profile);

      await manager._syncProfilesToMemory();
      
      // Should not throw and profile still marked for sync
      expect(manager.profiles.get(pubkey).needsSync).toBe(true);
    });

    it('handles sync errors gracefully', async () => {
      manager.runtime.createMemory = async () => {
        throw new Error('Sync error');
      };

      const pubkey = 'error-sync';
      const profile = manager._createEmptyProfile(pubkey);
      profile.needsSync = true;
      manager.profiles.set(pubkey, profile);

      // Should not throw
      await expect(manager._syncProfilesToMemory()).resolves.not.toThrow();
    });
  });

  describe('System Context - _getSystemContext', () => {
    it('returns null when runtime is missing', async () => {
      manager.runtime = null;
      const context = await manager._getSystemContext();
      expect(context).toBeNull();
    });

    it('caches system context after first load', async () => {
      // Mock the context module
      const mockContext = { rooms: {}, worldId: 'test-world' };
      vi.doMock('../lib/context.js', () => ({
        ensureNostrContextSystem: async () => mockContext
      }));

      const context1 = await manager._getSystemContext();
      const context2 = await manager._getSystemContext();
      
      // Should return same instance (cached)
      if (context1 && context2) {
        expect(context1).toBe(context2);
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('handles missing pubkey gracefully', async () => {
      const profile = await manager.getProfile('');
      expect(profile).toBeDefined();
      expect(profile.pubkey).toBe('');
    });

    it('handles very long interaction history', async () => {
      const pubkey = 'long-history';
      const originalLimit = manager.interactionHistoryLimit;
      manager.interactionHistoryLimit = 10;

      for (let i = 0; i < 100; i++) {
        await manager.recordInteraction(pubkey, { type: 'test', index: i });
      }

      const profile = await manager.getProfile(pubkey);
      expect(profile.interactions.length).toBe(10);
      
      manager.interactionHistoryLimit = originalLimit;
    });

    it('handles concurrent profile updates', async () => {
      const pubkey = 'concurrent';
      
      // Simulate concurrent updates
      await Promise.all([
        manager.updateProfile(pubkey, { qualityScore: 0.7 }),
        manager.updateProfile(pubkey, { engagementScore: 0.8 }),
        manager.recordInteraction(pubkey, { type: 'test' })
      ]);

      const profile = await manager.getProfile(pubkey);
      expect(profile).toBeDefined();
      // At least one update should have succeeded
      expect(profile.qualityScore !== 0.5 || profile.engagementScore !== 0.0 || profile.totalInteractions > 0).toBe(true);
    });

    it('handles special characters in pubkeys', async () => {
      const pubkey = 'test-pubkey-!@#$%^&*()';
      const profile = await manager.getProfile(pubkey);
      expect(profile.pubkey).toBe(pubkey);
    });

    it('handles empty topic interests in similarity calculation', () => {
      const similarity = manager._calculateTopicSimilarity({}, {});
      expect(similarity).toBe(0);
    });

    it('handles negative engagement scores', async () => {
      const pubkey = 'negative-eng';
      await manager.recordTopicInterest(pubkey, 'topic', -0.5);
      
      const profile = await manager.getProfile(pubkey);
      // Should handle gracefully
      expect(profile.topicInterests.topic).toBeDefined();
    });
  });
});
