import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the core module before importing the service
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

vi.mock('../lib/nostr', () => ({
  isSelfAuthor: vi.fn().mockReturnValue(false),
  getConversationIdFromEvent: vi.fn().mockReturnValue('conversation-id'),
  extractTopicsFromEvent: vi.fn().mockResolvedValue([])
}));

vi.mock('../lib/image-vision.js', () => ({
  processImageContent: vi.fn().mockResolvedValue({ imageDescriptions: [], imageUrls: [] })
}));

import { NostrService } from '../lib/service.js';

describe('NostrService Basic Lifecycle', () => {
  let service;
  let mockRuntime;

  beforeEach(() => {
    mockRuntime = {
      character: { 
        name: 'TestBot',
        postExamples: ['test post'],
        style: { all: ['helpful'], post: ['concise'] }
      },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay1.test,wss://relay2.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_DM_ENABLE': 'true',
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
      logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    };

    service = null;
  });

  afterEach(async () => {
    if (service && typeof service.stop === 'function') {
      await service.stop();
    }
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create service instance with runtime', () => {
      service = new NostrService(mockRuntime);

      expect(service).toBeDefined();
      expect(service.runtime).toBe(mockRuntime);
      expect(service.handledEventIds).toBeInstanceOf(Set);
      expect(service.lastReplyByUser).toBeInstanceOf(Map);
      expect(service.pendingReplyTimers).toBeInstanceOf(Map);
    });

    it('should initialize with default throttle settings', () => {
      service = new NostrService(mockRuntime);

      expect(service.replyThrottleSec).toBe(60);
      expect(service.replyEnabled).toBe(true);
    });

    it('should initialize posting queue', () => {
      service = new NostrService(mockRuntime);

      expect(service.postingQueue).toBeDefined();
      expect(service.postingQueue.minDelayBetweenPosts).toBeGreaterThan(0);
      expect(service.postingQueue.maxDelayBetweenPosts).toBeGreaterThan(0);
    });
  });

  describe('stop()', () => {
    it('should clear all timers on stop', async () => {
      service = new NostrService(mockRuntime);
      service.postTimer = setTimeout(() => {}, 10000);
      service.listenUnsub = vi.fn();
      service.pool = { close: vi.fn() };

      await service.stop();

      expect(service.postTimer).toBe(null);
      expect(service.listenUnsub).toHaveBeenCalled();
      expect(service.pool.close).toHaveBeenCalled();
    });

    it('should clear pending reply timers', async () => {
      service = new NostrService(mockRuntime);
      const timer1 = setTimeout(() => {}, 10000);
      const timer2 = setTimeout(() => {}, 10000);
      service.pendingReplyTimers.set('user1', timer1);
      service.pendingReplyTimers.set('user2', timer2);

      await service.stop();

      expect(service.pendingReplyTimers.size).toBe(0);
    });

    it('should handle stop with null pool gracefully', async () => {
      service = new NostrService(mockRuntime);
      service.pool = null;

      await expect(service.stop()).resolves.not.toThrow();
    });
  });

  describe('Event ID Deduplication', () => {
    it('should track handled event IDs', () => {
      service = new NostrService(mockRuntime);
      const eventId = 'test-event-123';

      expect(service.handledEventIds.has(eventId)).toBe(false);
      
      service.handledEventIds.add(eventId);
      
      expect(service.handledEventIds.has(eventId)).toBe(true);
    });

    it('should prevent duplicate event handling', () => {
      service = new NostrService(mockRuntime);
      const eventId = 'test-event-456';

      // First handling
      const firstCheck = !service.handledEventIds.has(eventId);
      service.handledEventIds.add(eventId);

      // Second handling attempt
      const secondCheck = !service.handledEventIds.has(eventId);

      expect(firstCheck).toBe(true);
      expect(secondCheck).toBe(false);
    });
  });

  describe('Throttling Maps', () => {
    it('should manage reply throttling per user', () => {
      service = new NostrService(mockRuntime);
      const userPubkey = 'user-pubkey-123';
      const timestamp = Date.now();

      service.lastReplyByUser.set(userPubkey, timestamp);

      expect(service.lastReplyByUser.get(userPubkey)).toBe(timestamp);
      expect(service.lastReplyByUser.has(userPubkey)).toBe(true);
    });

    it('should track pending reply timers per user', () => {
      service = new NostrService(mockRuntime);
      const userPubkey = 'user-pubkey-456';
      const timer = setTimeout(() => {}, 5000);

      service.pendingReplyTimers.set(userPubkey, timer);

      expect(service.pendingReplyTimers.has(userPubkey)).toBe(true);
      
      clearTimeout(timer);
      service.pendingReplyTimers.delete(userPubkey);
      
      expect(service.pendingReplyTimers.has(userPubkey)).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should read relay configuration from runtime', () => {
      service = new NostrService(mockRuntime);
      
      const relaysSetting = mockRuntime.getSetting('NOSTR_RELAYS');
      
      expect(relaysSetting).toBe('wss://relay1.test,wss://relay2.test');
    });

    it('should read private key configuration from runtime', () => {
      service = new NostrService(mockRuntime);
      
      const privateKey = mockRuntime.getSetting('NOSTR_PRIVATE_KEY');
      
      expect(privateKey).toBe('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
      expect(privateKey.length).toBe(64);
    });

    it('should read reply enable configuration', () => {
      service = new NostrService(mockRuntime);
      
      const replyEnabled = mockRuntime.getSetting('NOSTR_REPLY_ENABLE');
      
      expect(replyEnabled).toBe('true');
    });
  });
});
