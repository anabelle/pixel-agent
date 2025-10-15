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

import { NostrService } from '../lib/service.js';

describe('NostrService Throttling and Configuration', () => {
  let service;
  let mockRuntime;

  beforeEach(async () => {
    mockRuntime = {
      character: {
        name: 'TestBot',
        postExamples: ['test post'],
        style: { all: ['helpful'], post: ['concise'] }
      },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_DM_ENABLE': 'true',
          'NOSTR_REPLY_THROTTLE_SEC': '60',
          'NOSTR_DM_THROTTLE_SEC': '120',
          'NOSTR_CONTEXT_ACCUMULATOR_ENABLED': 'false',
          'NOSTR_HOME_FEED_ENABLE': 'false',
          'NOSTR_DISCOVERY_ENABLE': 'false',
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

    // Mock pool setup
    const mockPool = {
      subscribeMany: vi.fn(() => vi.fn()),
      publish: vi.fn().mockResolvedValue(true),
      close: vi.fn()
    };
    mockRuntime.createSimplePool = vi.fn(() => mockPool);

    service = await NostrService.start(mockRuntime);
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
    vi.clearAllMocks();
  });

  describe('Reply Throttling', () => {
    it('should enforce reply throttle period', () => {
      const userId = 'user-123';
      const now = Date.now();
      
      service.lastReplyByUser.set(userId, now - 30000); // 30 seconds ago
      service.replyThrottleSec = 60;

      const timeSinceLastReply = (now - service.lastReplyByUser.get(userId)) / 1000;
      const isThrottled = timeSinceLastReply < service.replyThrottleSec;

      expect(isThrottled).toBe(true);
    });

    it('should allow reply after throttle period expires', () => {
      const userId = 'user-123';
      const now = Date.now();
      
      service.lastReplyByUser.set(userId, now - 70000); // 70 seconds ago
      service.replyThrottleSec = 60;

      const timeSinceLastReply = (now - service.lastReplyByUser.get(userId)) / 1000;
      const isThrottled = timeSinceLastReply < service.replyThrottleSec;

      expect(isThrottled).toBe(false);
    });

    it('should track last reply time per user', () => {
      service.lastReplyByUser.set('user-1', Date.now() - 10000);
      service.lastReplyByUser.set('user-2', Date.now() - 20000);

      expect(service.lastReplyByUser.has('user-1')).toBe(true);
      expect(service.lastReplyByUser.has('user-2')).toBe(true);
      expect(service.lastReplyByUser.get('user-1')).toBeGreaterThan(
        service.lastReplyByUser.get('user-2')
      );
    });

    it('should initialize with empty throttle map', () => {
      expect(service.lastReplyByUser.size).toBe(0);
    });

    it('should handle throttle check for new user', () => {
      const userId = 'new-user';
      
      expect(service.lastReplyByUser.has(userId)).toBe(false);
    });
  });

  describe('DM Throttling', () => {
    it('should enforce DM throttle period', () => {
      const userId = 'dm-user';
      const now = Date.now();
      
      service.lastReplyByUser.set(userId, now - 60000); // 1 minute ago
      service.dmThrottleSec = 120;

      const timeSinceLastReply = (now - service.lastReplyByUser.get(userId)) / 1000;
      const isThrottled = timeSinceLastReply < service.dmThrottleSec;

      expect(isThrottled).toBe(true);
    });

    it('should use separate throttle for DMs', () => {
      expect(service.dmThrottleSec).toBeDefined();
      expect(service.dmThrottleSec).toBeGreaterThan(0);
    });

    it('should load DM throttle from config', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_DM_THROTTLE_SEC') return '180';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.dmThrottleSec).toBe(180);
      
      await testService.stop();
    });
  });

  describe('Zap Cooldown', () => {
    it('should enforce zap cooldown per user', () => {
      const userId = 'zap-user';
      const now = Date.now();
      
      service.zapCooldownByUser.set(userId, now - 1800000); // 30 minutes ago
      
      const cooldownMs = 3600000; // 1 hour
      const timeSinceLast = now - service.zapCooldownByUser.get(userId);
      const isCooledDown = timeSinceLast < cooldownMs;

      expect(isCooledDown).toBe(true);
    });

    it('should allow zap after cooldown expires', () => {
      const userId = 'zap-user';
      const now = Date.now();
      
      service.zapCooldownByUser.set(userId, now - 7200000); // 2 hours ago
      
      const cooldownMs = 3600000; // 1 hour
      const timeSinceLast = now - service.zapCooldownByUser.get(userId);
      const isCooledDown = timeSinceLast < cooldownMs;

      expect(isCooledDown).toBe(false);
    });

    it('should track zap cooldown per user independently', () => {
      service.zapCooldownByUser.set('user-1', Date.now() - 1000000);
      service.zapCooldownByUser.set('user-2', Date.now() - 2000000);

      expect(service.zapCooldownByUser.has('user-1')).toBe(true);
      expect(service.zapCooldownByUser.has('user-2')).toBe(true);
    });
  });

  describe('Configuration Loading', () => {
    it('should load relay configuration', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_RELAYS') return 'wss://relay1.test,wss://relay2.test,wss://relay3.test';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.relays).toEqual([
        'wss://relay1.test',
        'wss://relay2.test',
        'wss://relay3.test'
      ]);
      
      await testService.stop();
    });

    it('should handle single relay configuration', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_RELAYS') return 'wss://single-relay.test';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.relays).toEqual(['wss://single-relay.test']);
      
      await testService.stop();
    });

    it('should handle empty relay configuration', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_RELAYS') return '';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.relays).toEqual([]);
      
      await testService.stop();
    });

    it('should trim whitespace from relay URLs', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_RELAYS') return ' wss://relay1.test , wss://relay2.test ';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.relays).toContain('wss://relay1.test');
      expect(testService.relays).toContain('wss://relay2.test');
      
      await testService.stop();
    });

    it('should parse throttle seconds correctly', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_REPLY_THROTTLE_SEC') return '90';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.replyThrottleSec).toBe(90);
      
      await testService.stop();
    });

    it('should handle invalid throttle values', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_REPLY_THROTTLE_SEC') return 'invalid';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(typeof testService.replyThrottleSec).toBe('number');
      expect(testService.replyThrottleSec).toBeGreaterThan(0);
      
      await testService.stop();
    });

    it('should load boolean flags correctly', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://test.relay',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_DM_ENABLE': 'false',
          'NOSTR_DISCOVERY_ENABLE': 'true',
          'NOSTR_HOME_FEED_ENABLE': 'false',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false'
        };
        return settings[key] || '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.replyEnabled).toBe(true);
      expect(testService.dmEnabled).toBe(false);
      expect(testService.discoveryEnabled).toBe(true);
      expect(testService.homeFeedEnabled).toBe(false);
      
      await testService.stop();
    });

    it('should handle case-insensitive boolean values', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_REPLY_ENABLE') return 'TRUE';
        if (key === 'NOSTR_DM_ENABLE') return 'False';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.replyEnabled).toBe(true);
      expect(testService.dmEnabled).toBe(false);
      
      await testService.stop();
    });
  });

  describe('Delay Configuration', () => {
    it('should load reply delay settings', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_REPLY_INITIAL_DELAY_MIN_MS') return '500';
        if (key === 'NOSTR_REPLY_INITIAL_DELAY_MAX_MS') return '2000';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.replyInitialDelayMinMs).toBe(500);
      expect(testService.replyInitialDelayMaxMs).toBe(2000);
      
      await testService.stop();
    });

    it('should validate delay min <= max', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_REPLY_INITIAL_DELAY_MIN_MS') return '3000';
        if (key === 'NOSTR_REPLY_INITIAL_DELAY_MAX_MS') return '1000';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.replyInitialDelayMinMs).toBeLessThanOrEqual(
        testService.replyInitialDelayMaxMs
      );
      
      await testService.stop();
    });

    it('should handle negative delay values', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_REPLY_INITIAL_DELAY_MIN_MS') return '-500';
        if (key === 'NOSTR_REPLY_INITIAL_DELAY_MAX_MS') return '-1000';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.replyInitialDelayMinMs).toBeGreaterThanOrEqual(0);
      expect(testService.replyInitialDelayMaxMs).toBeGreaterThanOrEqual(0);
      
      await testService.stop();
    });
  });

  describe('Discovery Configuration', () => {
    it('should load discovery interval settings', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_DISCOVERY_INTERVAL_MIN') return '600';
        if (key === 'NOSTR_DISCOVERY_INTERVAL_MAX') return '1200';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.discoveryMinSec).toBe(600);
      expect(testService.discoveryMaxSec).toBe(1200);
      
      await testService.stop();
    });

    it('should load discovery limits', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_DISCOVERY_MAX_REPLIES_PER_RUN') return '10';
        if (key === 'NOSTR_DISCOVERY_MAX_FOLLOWS_PER_RUN') return '8';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.discoveryMaxReplies).toBe(10);
      expect(testService.discoveryMaxFollows).toBe(8);
      
      await testService.stop();
    });

    it('should load quality thresholds', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_DISCOVERY_MIN_QUALITY_INTERACTIONS') return '2';
        if (key === 'NOSTR_DISCOVERY_STARTING_THRESHOLD') return '0.7';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.discoveryMinQualityInteractions).toBe(2);
      expect(testService.discoveryStartingThreshold).toBe(0.7);
      
      await testService.stop();
    });
  });

  describe('Home Feed Configuration', () => {
    it('should load home feed interval settings', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_HOME_FEED_INTERVAL_MIN') return '400';
        if (key === 'NOSTR_HOME_FEED_INTERVAL_MAX') return '800';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.homeFeedMinSec).toBe(400);
      expect(testService.homeFeedMaxSec).toBe(800);
      
      await testService.stop();
    });

    it('should load interaction chances', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_HOME_FEED_REACTION_CHANCE') return '0.2';
        if (key === 'NOSTR_HOME_FEED_REPOST_CHANCE') return '0.05';
        if (key === 'NOSTR_HOME_FEED_QUOTE_CHANCE') return '0.03';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.homeFeedReactionChance).toBe(0.2);
      expect(testService.homeFeedRepostChance).toBe(0.05);
      expect(testService.homeFeedQuoteChance).toBe(0.03);
      
      await testService.stop();
    });

    it('should clamp interaction chances to 0-1 range', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_HOME_FEED_REACTION_CHANCE') return '1.5';
        if (key === 'NOSTR_HOME_FEED_REPOST_CHANCE') return '-0.1';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.homeFeedReactionChance).toBeLessThanOrEqual(1);
      expect(testService.homeFeedReactionChance).toBeGreaterThanOrEqual(0);
      expect(testService.homeFeedRepostChance).toBeGreaterThanOrEqual(0);
      
      await testService.stop();
    });

    it('should load max interactions limit', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_HOME_FEED_MAX_INTERACTIONS') return '3';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.homeFeedMaxInteractions).toBe(3);
      
      await testService.stop();
    });

    it('should clamp max interactions to reasonable range', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_HOME_FEED_MAX_INTERACTIONS') return '0';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.homeFeedMaxInteractions).toBeGreaterThanOrEqual(1);
      
      await testService.stop();
    });
  });

  describe('Connection Monitoring Configuration', () => {
    it('should load connection monitoring settings', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_CONNECTION_MONITOR_ENABLE') return 'true';
        if (key === 'NOSTR_CONNECTION_CHECK_INTERVAL_SEC') return '30';
        if (key === 'NOSTR_MAX_TIME_SINCE_LAST_EVENT_SEC') return '180';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.connectionMonitorEnabled).toBe(true);
      expect(testService.connectionCheckIntervalMs).toBe(30000);
      expect(testService.maxTimeSinceLastEventMs).toBe(180000);
      
      await testService.stop();
    });

    it('should load reconnection settings', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_RECONNECT_DELAY_SEC') return '45';
        if (key === 'NOSTR_MAX_RECONNECT_ATTEMPTS') return '3';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.reconnectDelayMs).toBe(45000);
      expect(testService.maxReconnectAttempts).toBe(3);
      
      await testService.stop();
    });

    it('should clamp reconnect attempts to reasonable range', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_MAX_RECONNECT_ATTEMPTS') return '0';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.maxReconnectAttempts).toBeGreaterThanOrEqual(1);
      expect(testService.maxReconnectAttempts).toBeLessThanOrEqual(20);
      
      await testService.stop();
    });
  });

  describe('Unfollow Configuration', () => {
    it('should load unfollow settings', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_UNFOLLOW_ENABLE') return 'true';
        if (key === 'NOSTR_UNFOLLOW_MIN_QUALITY_SCORE') return '0.3';
        if (key === 'NOSTR_UNFOLLOW_MIN_POSTS_THRESHOLD') return '15';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.unfollowEnabled).toBe(true);
      expect(testService.unfollowMinQualityScore).toBe(0.3);
      expect(testService.unfollowMinPostsThreshold).toBe(15);
      
      await testService.stop();
    });

    it('should clamp quality score to 0-1 range', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_UNFOLLOW_MIN_QUALITY_SCORE') return '1.5';
        if (key === 'NOSTR_RELAYS') return 'wss://test.relay';
        return '';
      });

      const testService = await NostrService.start(mockRuntime);
      
      expect(testService.unfollowMinQualityScore).toBeLessThanOrEqual(1);
      
      await testService.stop();
    });
  });
});
