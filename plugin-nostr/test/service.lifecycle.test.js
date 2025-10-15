import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NostrService } from '../lib/service.js';

describe('NostrService Lifecycle', () => {
  let service;
  let mockRuntime;
  let mockPool;

  beforeEach(() => {
    // Mock runtime with minimal required interface
    mockRuntime = {
      character: { 
        name: 'TestAgent',
        postExamples: ['test post'],
        style: { all: ['helpful'], post: ['concise'] }
      },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay1.test,wss://relay2.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_LISTEN_ENABLE': 'true',
          'NOSTR_POST_ENABLE': 'false',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_DM_ENABLE': 'true',
          'NOSTR_DM_REPLY_ENABLE': 'true',
          'NOSTR_CONTEXT_ACCUMULATOR_ENABLED': 'false',
          'NOSTR_CONTEXT_LLM_ANALYSIS': 'false',
          'NOSTR_HOME_FEED_ENABLE': 'false',
          'NOSTR_DISCOVERY_ENABLE': 'false',
          'NOSTR_ENABLE_PING': 'false',
          'NOSTR_POST_DAILY_DIGEST_ENABLE': 'false',
          'NOSTR_CONNECTION_MONITOR_ENABLE': 'false',
          'NOSTR_UNFOLLOW_ENABLE': 'false',
          'NOSTR_DM_THROTTLE_SEC': '60',
          'NOSTR_REPLY_THROTTLE_SEC': '60',
          'NOSTR_REPLY_INITIAL_DELAY_MIN_MS': '0',
          'NOSTR_REPLY_INITIAL_DELAY_MAX_MS': '0',
          'NOSTR_ZAP_THANKS_ENABLE': 'true'
        };
        return settings[key] || '';
      }),
      useModel: vi.fn(),
      createMemory: vi.fn(),
      getMemoryById: vi.fn(),
      getMemories: vi.fn(() => []),
      ensureWorldExists: vi.fn(),
      ensureRoomExists: vi.fn(),
      ensureConnection: vi.fn(),
      agentId: 'test-agent',
      logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    };

    // Mock pool
    mockPool = {
      subscribeMany: vi.fn(() => vi.fn()),
      publish: vi.fn(),
      close: vi.fn()
    };

    // Add createSimplePool to mockRuntime
    mockRuntime.createSimplePool = vi.fn(() => mockPool);

    service = null;
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with valid configuration', async () => {
      service = await NostrService.start(mockRuntime);

      expect(service).toBeDefined();
      expect(service.runtime).toBe(mockRuntime);
      expect(service.relays).toEqual(['wss://relay1.test', 'wss://relay2.test']);
      expect(service.pkHex).toBeDefined();
      expect(service.replyEnabled).toBe(true);
      expect(service.dmEnabled).toBe(true);
    });

    it('should handle missing relays gracefully', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_RELAYS') return '';
        return mockRuntime.getSetting(key);
      });

      service = await NostrService.start(mockRuntime);

      expect(service).toBeDefined();
      expect(service.relays).toEqual([]);
      expect(mockRuntime.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No relays configured')
      );
    });

    it('should handle missing private key (listen-only mode)', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_PRIVATE_KEY') return '';
        if (key === 'NOSTR_PUBLIC_KEY') return 'npub1test123456789abcdefghijklmnopqrstuvwxyz';
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_LISTEN_ENABLE': 'true',
          'NOSTR_POST_ENABLE': 'false',
          'NOSTR_REPLY_ENABLE': 'true'
        };
        return settings[key] || '';
      });

      service = await NostrService.start(mockRuntime);

      expect(service).toBeDefined();
      expect(service.sk).toBeNull();
      expect(mockRuntime.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No private key configured')
      );
    });

    it('should handle missing both private and public keys', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        if (key === 'NOSTR_PRIVATE_KEY') return '';
        if (key === 'NOSTR_PUBLIC_KEY') return '';
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false'
        };
        return settings[key] || '';
      });

      service = await NostrService.start(mockRuntime);

      expect(service).toBeDefined();
      expect(service.sk).toBeNull();
      expect(service.pkHex).toBeNull();
      expect(mockRuntime.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No key configured')
      );
    });

    it('should initialize context accumulator when enabled', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_CONTEXT_ACCUMULATOR_ENABLED': 'true',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false'
        };
        return settings[key] || '';
      });

      service = await NostrService.start(mockRuntime);

      expect(service.contextAccumulator).toBeDefined();
      expect(service.contextAccumulator.enabled).toBe(true);
    });

    it('should not initialize context accumulator when disabled', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_CONTEXT_ACCUMULATOR_ENABLED': 'false',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false'
        };
        return settings[key] || '';
      });

      service = await NostrService.start(mockRuntime);

      expect(service.contextAccumulator).toBeDefined();
      expect(service.contextAccumulator.enabled).toBe(false);
    });
  });

  describe('Configuration Loading', () => {
    it('should load throttle settings correctly', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_REPLY_THROTTLE_SEC': '120',
          'NOSTR_DM_THROTTLE_SEC': '180',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false'
        };
        return settings[key] || '';
      });

      service = await NostrService.start(mockRuntime);

      expect(service.replyThrottleSec).toBe(120);
      expect(service.dmThrottleSec).toBe(180);
    });

    it('should load reply delay settings correctly', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_REPLY_INITIAL_DELAY_MIN_MS': '1000',
          'NOSTR_REPLY_INITIAL_DELAY_MAX_MS': '3000',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false'
        };
        return settings[key] || '';
      });

      service = await NostrService.start(mockRuntime);

      expect(service.replyInitialDelayMinMs).toBe(1000);
      expect(service.replyInitialDelayMaxMs).toBe(3000);
    });

    it('should swap delay min/max if max is less than min', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_REPLY_INITIAL_DELAY_MIN_MS': '3000',
          'NOSTR_REPLY_INITIAL_DELAY_MAX_MS': '1000',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false'
        };
        return settings[key] || '';
      });

      service = await NostrService.start(mockRuntime);

      expect(service.replyInitialDelayMinMs).toBe(1000);
      expect(service.replyInitialDelayMaxMs).toBe(3000);
    });

    it('should load feature flags correctly', async () => {
      mockRuntime.getSetting = vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_REPLY_ENABLE': 'false',
          'NOSTR_DM_ENABLE': 'false',
          'NOSTR_DM_REPLY_ENABLE': 'false',
          'NOSTR_DISCOVERY_ENABLE': 'false',
          'NOSTR_HOME_FEED_ENABLE': 'false',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false'
        };
        return settings[key] || '';
      });

      service = await NostrService.start(mockRuntime);

      expect(service.replyEnabled).toBe(false);
      expect(service.dmEnabled).toBe(false);
      expect(service.dmReplyEnabled).toBe(false);
      expect(service.discoveryEnabled).toBe(false);
      expect(service.homeFeedEnabled).toBe(false);
    });
  });

  describe('Service Stop', () => {
    it('should clean up all resources on stop', async () => {
      service = await NostrService.start(mockRuntime);
      
      // Set up some timers
      service.postTimer = setTimeout(() => {}, 1000);
      service.discoveryTimer = setTimeout(() => {}, 1000);
      service.homeFeedTimer = setTimeout(() => {}, 1000);
      service.connectionMonitorTimer = setTimeout(() => {}, 1000);

      await service.stop();

      expect(service.postTimer).toBeNull();
      expect(service.discoveryTimer).toBeNull();
      expect(service.homeFeedTimer).toBeNull();
      expect(service.connectionMonitorTimer).toBeNull();
    });

    it('should clear pending reply timers on stop', async () => {
      service = await NostrService.start(mockRuntime);
      
      // Add some pending reply timers
      const timer1 = setTimeout(() => {}, 1000);
      const timer2 = setTimeout(() => {}, 1000);
      service.pendingReplyTimers.set('user1', timer1);
      service.pendingReplyTimers.set('user2', timer2);

      await service.stop();

      expect(service.pendingReplyTimers.size).toBe(0);
    });

    it('should close pool and unsubscribe on stop', async () => {
      service = await NostrService.start(mockRuntime);
      
      const mockUnsub = vi.fn();
      service.listenUnsub = mockUnsub;
      service.homeFeedUnsub = vi.fn();
      service.pool = mockPool;

      await service.stop();

      expect(service.listenUnsub).toBeNull();
      expect(service.homeFeedUnsub).toBeNull();
      expect(service.pool).toBeNull();
    });

    it('should handle stop when already stopped', async () => {
      service = await NostrService.start(mockRuntime);
      
      await service.stop();
      // Should not throw
      await expect(service.stop()).resolves.not.toThrow();
    });

    it('should handle stop with null pool gracefully', async () => {
      service = await NostrService.start(mockRuntime);
      service.pool = null;

      await expect(service.stop()).resolves.not.toThrow();
    });
  });

  describe('State Management', () => {
    it('should initialize empty handled event IDs set', async () => {
      service = await NostrService.start(mockRuntime);

      expect(service.handledEventIds).toBeDefined();
      expect(service.handledEventIds instanceof Set).toBe(true);
    });

    it('should initialize user interaction tracking', async () => {
      service = await NostrService.start(mockRuntime);

      expect(service.lastReplyByUser).toBeDefined();
      expect(service.lastReplyByUser instanceof Map).toBe(true);
      expect(service.zapCooldownByUser).toBeDefined();
      expect(service.zapCooldownByUser instanceof Map).toBe(true);
      expect(service.userInteractionCount).toBeDefined();
      expect(service.userInteractionCount instanceof Map).toBe(true);
    });

    it('should initialize followed users set', async () => {
      service = await NostrService.start(mockRuntime);

      expect(service.followedUsers).toBeDefined();
      expect(service.followedUsers instanceof Set).toBe(true);
    });

    it('should initialize connection monitoring state', async () => {
      service = await NostrService.start(mockRuntime);

      expect(service.lastEventReceived).toBeDefined();
      expect(typeof service.lastEventReceived).toBe('number');
      expect(service.reconnectAttempts).toBe(0);
    });
  });

  describe('Component Initialization', () => {
    it('should initialize semantic analyzer', async () => {
      service = await NostrService.start(mockRuntime);

      expect(service.semanticAnalyzer).toBeDefined();
    });

    it('should initialize user profile manager', async () => {
      service = await NostrService.start(mockRuntime);

      expect(service.userProfileManager).toBeDefined();
    });

    it('should initialize narrative memory', async () => {
      service = await NostrService.start(mockRuntime);

      expect(service.narrativeMemory).toBeDefined();
    });

    it('should initialize posting queue', async () => {
      service = await NostrService.start(mockRuntime);

      expect(service.postingQueue).toBeDefined();
    });

    it('should initialize discovery metrics', async () => {
      service = await NostrService.start(mockRuntime);

      expect(service.discoveryMetrics).toBeDefined();
      expect(service.discoveryMetrics instanceof Object).toBe(true);
    });
  });

  describe('Logger Integration', () => {
    it('should use runtime logger when available', async () => {
      service = await NostrService.start(mockRuntime);

      expect(service.logger).toBeDefined();
      expect(typeof service.logger.info).toBe('function');
      expect(typeof service.logger.debug).toBe('function');
      expect(typeof service.logger.warn).toBe('function');
      expect(typeof service.logger.error).toBe('function');
    });

    it('should handle missing runtime logger gracefully', async () => {
      const runtimeWithoutLogger = { ...mockRuntime };
      delete runtimeWithoutLogger.logger;

      service = await NostrService.start(runtimeWithoutLogger);

      expect(service.logger).toBeDefined();
    });
  });

  describe('UUID Creation', () => {
    it('should have createUniqueUuid function', async () => {
      service = await NostrService.start(mockRuntime);

      expect(service.createUniqueUuid).toBeDefined();
      expect(typeof service.createUniqueUuid).toBe('function');
    });

    it('should create unique UUIDs', async () => {
      service = await NostrService.start(mockRuntime);

      const uuid1 = service.createUniqueUuid(mockRuntime, 'test1');
      const uuid2 = service.createUniqueUuid(mockRuntime, 'test2');

      expect(uuid1).toBeDefined();
      expect(uuid2).toBeDefined();
      expect(uuid1).not.toBe(uuid2);
    });
  });
});
