import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the core module
const mockLogger = {
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
};

vi.mock('@elizaos/core', () => {
  const mocked = {
    logger: mockLogger,
    createUniqueUuid: vi.fn((runtime, seed) => `test-uuid-${seed || Math.random()}`),
    ChannelType: { PUBLIC: 'PUBLIC', DIRECT: 'DIRECT' },
    ModelType: { TEXT_SMALL: 'TEXT_SMALL', TEXT_MEDIUM: 'TEXT_MEDIUM' }
  };
  mocked.default = mocked;
  return mocked;
});

// Mock discovery and scoring modules
vi.mock('../lib/discovery', () => ({
  pickDiscoveryTopics: vi.fn().mockReturnValue(['topic1', 'topic2']),
  isSemanticMatch: vi.fn().mockReturnValue(true),
  isQualityAuthor: vi.fn().mockReturnValue(true),
  selectFollowCandidates: vi.fn().mockResolvedValue([])
}));

vi.mock('../lib/scoring', () => ({
  _scoreEventForEngagement: vi.fn().mockResolvedValue(0.8),
  _isQualityContent: vi.fn().mockReturnValue(true)
}));

vi.mock('../lib/generation', () => ({
  generateWithModelOrFallback: vi.fn().mockResolvedValue('Generated text')
}));

import { NostrService } from '../lib/service.js';

describe('NostrService Discovery and Integration', () => {
  let service;
  let mockRuntime;

  beforeEach(async () => {
    mockRuntime = {
      character: {
        name: 'TestBot',
        postExamples: ['test post'],
        style: { all: ['helpful'], post: ['concise'] },
        topics: ['AI', 'technology', 'coding']
      },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_DISCOVERY_ENABLE': 'true',
          'NOSTR_DISCOVERY_INTERVAL_MIN': '900',
          'NOSTR_DISCOVERY_INTERVAL_MAX': '1800',
          'NOSTR_DISCOVERY_MAX_REPLIES_PER_RUN': '5',
          'NOSTR_DISCOVERY_MAX_FOLLOWS_PER_RUN': '3',
          'NOSTR_DISCOVERY_MIN_QUALITY_INTERACTIONS': '1',
          'NOSTR_CONTEXT_ACCUMULATOR_ENABLED': 'false',
          'NOSTR_HOME_FEED_ENABLE': 'false',
          'NOSTR_CONNECTION_MONITOR_ENABLE': 'false'
        };
        return settings[key] || '';
      }),
      useModel: vi.fn(),
      createMemory: vi.fn().mockResolvedValue({ id: 'memory-id' }),
      getMemoryById: vi.fn(),
      getMemories: vi.fn().mockResolvedValue([]),
      ensureWorldExists: vi.fn().mockResolvedValue({ id: 'world-id' }),
      ensureRoomExists: vi.fn().mockResolvedValue({ id: 'room-id' }),
      ensureConnection: vi.fn().mockResolvedValue({ id: 'connection-id' }),
      agentId: 'test-agent',
      logger: mockLogger
    };

    service = await NostrService.start(mockRuntime);
    service.pool = {
      subscribeMany: vi.fn(() => vi.fn()),
      publish: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
      list: vi.fn().mockResolvedValue([])
    };
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
    vi.clearAllMocks();
  });

  describe('Discovery Configuration', () => {
    it('should initialize discovery when enabled', () => {
      expect(service.discoveryEnabled).toBe(true);
      expect(service.discoveryMinSec).toBe(900);
      expect(service.discoveryMaxSec).toBe(1800);
    });

    it('should have discovery limits configured', () => {
      expect(service.discoveryMaxReplies).toBe(5);
      expect(service.discoveryMaxFollows).toBe(3);
      expect(service.discoveryMinQualityInteractions).toBe(1);
    });

    it('should initialize discovery metrics', () => {
      expect(service.discoveryMetrics).toBeDefined();
      expect(service.discoveryMetrics.roundsWithoutQuality).toBe(0);
      expect(service.discoveryMetrics.totalRounds).toBe(0);
    });

    it('should track discovery state', () => {
      expect(service.discoveryTimer).toBeDefined();
    });
  });

  describe('Discovery Metrics', () => {
    it('should record successful discovery round', () => {
      service.discoveryMetrics.recordRound(2, 5, 0.7);

      expect(service.discoveryMetrics.successfulRounds).toBe(1);
      expect(service.discoveryMetrics.totalRounds).toBe(1);
      expect(service.discoveryMetrics.roundsWithoutQuality).toBe(0);
    });

    it('should record failed discovery round', () => {
      service.discoveryMetrics.recordRound(0, 5, 0);

      expect(service.discoveryMetrics.roundsWithoutQuality).toBe(1);
      expect(service.discoveryMetrics.successfulRounds).toBe(0);
    });

    it('should determine when to lower thresholds', () => {
      service.discoveryMetrics.roundsWithoutQuality = 0;
      expect(service.discoveryMetrics.shouldLowerThresholds()).toBe(false);

      service.discoveryMetrics.roundsWithoutQuality = 3;
      expect(service.discoveryMetrics.shouldLowerThresholds()).toBe(true);
    });

    it('should adapt thresholds based on metrics', () => {
      const baseThreshold = 0.6;
      
      service.discoveryMetrics.roundsWithoutQuality = 0;
      expect(service.discoveryMetrics.getAdaptiveThreshold(baseThreshold)).toBe(0.6);

      service.discoveryMetrics.roundsWithoutQuality = 3;
      const adapted = service.discoveryMetrics.getAdaptiveThreshold(baseThreshold);
      expect(adapted).toBeLessThan(baseThreshold);
      expect(adapted).toBeGreaterThanOrEqual(0.3);
    });

    it('should update average quality score', () => {
      const initialAvg = service.discoveryMetrics.averageQualityScore;
      
      service.discoveryMetrics.recordRound(2, 5, 0.8);
      
      expect(service.discoveryMetrics.averageQualityScore).toBeGreaterThan(0);
    });
  });

  describe('scheduleNextDiscovery', () => {
    it('should schedule discovery timer', () => {
      service.discoveryTimer = null;
      service.scheduleNextDiscovery();

      expect(service.discoveryTimer).not.toBeNull();
    });

    it('should not schedule when discovery disabled', () => {
      service.discoveryEnabled = false;
      service.discoveryTimer = null;
      
      service.scheduleNextDiscovery();

      expect(service.discoveryTimer).toBeNull();
    });

    it('should not schedule without private key', () => {
      service.sk = null;
      service.discoveryTimer = null;
      
      service.scheduleNextDiscovery();

      expect(service.discoveryTimer).toBeNull();
    });

    it('should clear existing timer before scheduling', () => {
      service.discoveryTimer = setTimeout(() => {}, 1000);
      const oldTimer = service.discoveryTimer;
      
      service.scheduleNextDiscovery();

      expect(service.discoveryTimer).not.toBe(oldTimer);
    });
  });

  describe('Context Accumulator Integration', () => {
    it('should initialize context accumulator', () => {
      expect(service.contextAccumulator).toBeDefined();
    });

    it('should respect enabled/disabled state', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_CONTEXT_ACCUMULATOR_ENABLED') return 'true';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.contextAccumulator.enabled).toBe(true);
      
      await testService.stop();
    });

    it('should have LLM analysis configuration', () => {
      expect(service.contextAccumulator).toHaveProperty('llmAnalysis');
    });
  });

  describe('Narrative Memory Integration', () => {
    it('should initialize narrative memory', () => {
      expect(service.narrativeMemory).toBeDefined();
    });

    it('should have narrative memory methods', () => {
      expect(typeof service.narrativeMemory.storeHourlyNarrative).toBe('function');
      expect(typeof service.narrativeMemory.storeDailyNarrative).toBe('function');
      expect(typeof service.narrativeMemory.getTimelineLore).toBe('function');
    });
  });

  describe('Semantic Analyzer Integration', () => {
    it('should initialize semantic analyzer', () => {
      expect(service.semanticAnalyzer).toBeDefined();
    });

    it('should have semantic analysis methods', async () => {
      const hasIsSemanticMatch = typeof service.isSemanticMatchAsync === 'function';
      expect(hasIsSemanticMatch || service.semanticAnalyzer).toBeTruthy();
    });
  });

  describe('User Profile Manager Integration', () => {
    it('should initialize user profile manager', () => {
      expect(service.userProfileManager).toBeDefined();
    });

    it('should track user profiles', () => {
      expect(service.userProfileManager).toBeDefined();
    });
  });

  describe('Posting Queue Integration', () => {
    it('should have posting queue initialized', () => {
      expect(service.postingQueue).toBeDefined();
    });

    it('should have queue priorities defined', () => {
      expect(service.postingQueue.priorities).toBeDefined();
      expect(service.postingQueue.priorities.CRITICAL).toBeDefined();
      expect(service.postingQueue.priorities.HIGH).toBeDefined();
      expect(service.postingQueue.priorities.NORMAL).toBeDefined();
      expect(service.postingQueue.priorities.LOW).toBeDefined();
    });

    it('should configure queue delays', () => {
      expect(service.postingQueue.minDelayBetweenPosts).toBeGreaterThan(0);
      expect(service.postingQueue.maxDelayBetweenPosts).toBeGreaterThan(
        service.postingQueue.minDelayBetweenPosts
      );
    });

    it('should have mention priority boost', () => {
      expect(service.postingQueue.mentionPriorityBoost).toBeGreaterThan(0);
    });
  });

  describe('Mute List Management', () => {
    it('should initialize muted users set', () => {
      expect(service.mutedUsers).toBeDefined();
      expect(service.mutedUsers instanceof Set).toBe(true);
    });

    it('should track mute list cache TTL', () => {
      expect(service.muteListCacheTTL).toBeGreaterThan(0);
      expect(service.muteListLastFetched).toBe(0);
    });

    it('should add user to mute list', async () => {
      const pubkey = 'muted-user-pubkey';
      
      await service.muteUser(pubkey);

      expect(service.mutedUsers.has(pubkey)).toBe(true);
    });

    it('should remove user from mute list', async () => {
      const pubkey = 'unmuted-user-pubkey';
      
      service.mutedUsers.add(pubkey);
      await service.unmuteUser(pubkey);

      expect(service.mutedUsers.has(pubkey)).toBe(false);
    });

    it('should check if user is muted', async () => {
      const pubkey = 'test-user';
      
      service.mutedUsers.add(pubkey);
      const isMuted = await service._isUserMuted(pubkey);

      expect(isMuted).toBe(true);
    });

    it('should handle mute list loading errors', async () => {
      service.pool.list = vi.fn().mockRejectedValue(new Error('Load failed'));

      await expect(service._loadMuteList()).resolves.not.toThrow();
    });
  });

  describe('Follow Management', () => {
    it('should initialize followed users set', () => {
      expect(service.followedUsers).toBeDefined();
      expect(service.followedUsers instanceof Set).toBe(true);
    });

    it('should load current contacts', async () => {
      service.pool.list = vi.fn().mockResolvedValue([
        {
          kind: 3,
          tags: [
            ['p', 'user1'],
            ['p', 'user2']
          ]
        }
      ]);

      const contacts = await service._loadCurrentContacts();

      expect(contacts instanceof Set).toBe(true);
    });

    it('should handle contacts loading errors', async () => {
      service.pool.list = vi.fn().mockRejectedValue(new Error('Load failed'));

      const contacts = await service._loadCurrentContacts();

      expect(contacts instanceof Set).toBe(true);
    });

    it('should publish contacts list', async () => {
      const newContacts = new Set(['user1', 'user2', 'user3']);

      await service._publishContacts(newContacts);

      expect(service.pool.publish).toHaveBeenCalled();
    });

    it('should handle publish contacts errors', async () => {
      service.pool.publish.mockRejectedValue(new Error('Publish failed'));

      const newContacts = new Set(['user1']);

      await expect(service._publishContacts(newContacts)).resolves.not.toThrow();
    });
  });

  describe('Quality Scoring', () => {
    it('should score events for engagement', async () => {
      const event = {
        id: 'event-id',
        pubkey: 'author-pubkey',
        content: 'Great content about technology',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const score = await service._scoreEventForEngagement(event);

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle scoring errors', async () => {
      const event = null;

      await expect(service._scoreEventForEngagement(event)).resolves.not.toThrow();
    });
  });

  describe('User Interaction Limits', () => {
    it('should track user interaction counts', () => {
      expect(service.userInteractionCount).toBeDefined();
      expect(service.userInteractionCount instanceof Map).toBe(true);
    });

    it('should increment user interaction count', () => {
      const userId = 'test-user';
      
      service.userInteractionCount.set(userId, 1);
      const count = service.userInteractionCount.get(userId);
      service.userInteractionCount.set(userId, count + 1);

      expect(service.userInteractionCount.get(userId)).toBe(2);
    });

    it('should initialize count for new user', () => {
      const userId = 'new-user';
      
      expect(service.userInteractionCount.has(userId)).toBe(false);
      
      service.userInteractionCount.set(userId, 1);
      
      expect(service.userInteractionCount.get(userId)).toBe(1);
    });
  });

  describe('Home Feed Management', () => {
    it('should initialize home feed state', () => {
      expect(service.homeFeedEnabled).toBeDefined();
      expect(service.homeFeedTimer).toBeDefined();
      expect(service.homeFeedProcessedEvents instanceof Set).toBe(true);
      expect(service.homeFeedQualityTracked instanceof Set).toBe(true);
    });

    it('should have home feed configuration', () => {
      expect(service.homeFeedMinSec).toBeGreaterThan(0);
      expect(service.homeFeedMaxSec).toBeGreaterThan(service.homeFeedMinSec);
      expect(service.homeFeedReactionChance).toBeGreaterThanOrEqual(0);
      expect(service.homeFeedReactionChance).toBeLessThanOrEqual(1);
    });

    it('should start home feed when enabled', async () => {
      service.homeFeedEnabled = true;
      service.sk = service.sk || 'test-sk';
      service.homeFeedTimer = null;

      await service.startHomeFeed();

      expect(service.homeFeedUnsub).toBeDefined();
    });

    it('should not start home feed when disabled', async () => {
      service.homeFeedEnabled = false;
      service.homeFeedTimer = null;

      await service.startHomeFeed();

      // Should not start
      expect(service.homeFeedEnabled).toBe(false);
    });
  });

  describe('Timeline Lore Buffer', () => {
    it('should initialize timeline lore buffer', () => {
      expect(Array.isArray(service.timelineLoreBuffer)).toBe(true);
      expect(service.timelineLoreMaxBuffer).toBeGreaterThan(0);
      expect(service.timelineLoreBatchSize).toBeGreaterThan(0);
    });

    it('should have timeline lore timing configuration', () => {
      expect(service.timelineLoreMinIntervalMs).toBeGreaterThan(0);
      expect(service.timelineLoreMaxIntervalMs).toBeGreaterThan(service.timelineLoreMinIntervalMs);
    });

    it('should track timeline lore processing state', () => {
      expect(typeof service.timelineLoreProcessing).toBe('boolean');
      expect(service.timelineLoreLastRun).toBe(0);
    });
  });

  describe('Social Metrics Cache', () => {
    it('should initialize social metrics cache', () => {
      expect(service.userSocialMetrics instanceof Map).toBe(true);
      expect(service.socialMetricsCacheTTL).toBeGreaterThan(0);
    });

    it('should cache user social metrics', () => {
      const pubkey = 'test-user';
      const metrics = {
        followers: 100,
        following: 50,
        ratio: 2.0,
        lastUpdated: Date.now()
      };

      service.userSocialMetrics.set(pubkey, metrics);

      expect(service.userSocialMetrics.get(pubkey)).toEqual(metrics);
    });

    it('should check cache TTL', () => {
      const pubkey = 'test-user';
      const oldMetrics = {
        followers: 100,
        following: 50,
        ratio: 2.0,
        lastUpdated: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
      };

      service.userSocialMetrics.set(pubkey, oldMetrics);

      const cached = service.userSocialMetrics.get(pubkey);
      const isExpired = Date.now() - cached.lastUpdated > service.socialMetricsCacheTTL;

      expect(isExpired).toBe(true);
    });
  });

  describe('Thread Context', () => {
    it('should have thread context configuration', () => {
      expect(service.maxThreadContextEvents).toBeGreaterThan(0);
      expect(service.threadContextFetchRounds).toBeGreaterThan(0);
      expect(service.threadContextFetchBatch).toBeGreaterThan(0);
    });

    it('should clamp thread context limits', () => {
      expect(service.maxThreadContextEvents).toBeGreaterThanOrEqual(10);
      expect(service.maxThreadContextEvents).toBeLessThanOrEqual(200);
      expect(service.threadContextFetchRounds).toBeGreaterThanOrEqual(1);
      expect(service.threadContextFetchRounds).toBeLessThanOrEqual(8);
    });

    it('should fetch thread context for event', async () => {
      const event = {
        id: 'event-id',
        kind: 1,
        tags: [
          ['e', 'parent-id', '', 'reply']
        ]
      };

      service.pool.list = vi.fn().mockResolvedValue([]);

      const context = await service._getThreadContext(event);

      expect(Array.isArray(context)).toBe(true);
    });

    it('should handle thread context errors', async () => {
      const event = { id: 'event-id' };

      service.pool.list = vi.fn().mockRejectedValue(new Error('Fetch failed'));

      const context = await service._getThreadContext(event);

      expect(Array.isArray(context)).toBe(true);
    });
  });

  describe('Author Recent Cache', () => {
    it('should initialize author recent cache', () => {
      expect(service.authorRecentCache instanceof Map).toBe(true);
      expect(service.authorRecentCacheTtlMs).toBeGreaterThan(0);
    });

    it('should fetch recent author notes', async () => {
      const pubkey = 'author-pubkey';

      service.pool.list = vi.fn().mockResolvedValue([
        { id: 'note1', content: 'Note 1' },
        { id: 'note2', content: 'Note 2' }
      ]);

      const notes = await service._fetchRecentAuthorNotes(pubkey, 10);

      expect(Array.isArray(notes)).toBe(true);
    });

    it('should handle fetch errors', async () => {
      const pubkey = 'author-pubkey';

      service.pool.list = vi.fn().mockRejectedValue(new Error('Fetch failed'));

      const notes = await service._fetchRecentAuthorNotes(pubkey, 10);

      expect(Array.isArray(notes)).toBe(true);
    });
  });
});
