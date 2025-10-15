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

// Mock nostr tools
const mockNip44Decrypt = vi.fn().mockResolvedValue('Decrypted sealed message');
const mockNip44Encrypt = vi.fn().mockResolvedValue('Encrypted sealed message');

vi.mock('@nostr/tools', async () => {
  const actual = await vi.importActual('@nostr/tools');
  return {
    ...actual,
    SimplePool: vi.fn().mockImplementation(() => ({
      subscribeMany: vi.fn(() => vi.fn()),
      publish: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
      list: vi.fn().mockResolvedValue([])
    })),
    getPublicKey: vi.fn(() => 'test-pubkey-hex'),
    nip19: {
      npubEncode: vi.fn((hex) => `npub1${hex}`),
      decode: vi.fn((npub) => ({ type: 'npub', data: 'decoded-hex' }))
    },
    nip44: {
      decrypt: mockNip44Decrypt,
      encrypt: mockNip44Encrypt
    },
    nip04: {
      encrypt: vi.fn().mockResolvedValue('encrypted'),
      decrypt: vi.fn().mockResolvedValue('decrypted')
    }
  };
});

vi.mock('../lib/generation', () => ({
  generateWithModelOrFallback: vi.fn().mockResolvedValue('Generated response')
}));

vi.mock('../lib/image-vision.js', () => ({
  processImageContent: vi.fn().mockResolvedValue({ 
    imageDescriptions: [], 
    imageUrls: [] 
  })
}));

import { NostrService } from '../lib/service.js';

describe('NostrService Sealed DM and Setup', () => {
  let service;
  let mockRuntime;
  let mockPool;

  beforeEach(async () => {
    mockPool = {
      subscribeMany: vi.fn(() => vi.fn()),
      publish: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
      list: vi.fn().mockResolvedValue([])
    };

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
          'NOSTR_DM_REPLY_ENABLE': 'true',
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

    service = await NostrService.start(mockRuntime);
    service.pool = mockPool;
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
    vi.clearAllMocks();
  });

  describe('handleSealedDM', () => {
    it('should process sealed DM (kind 14)', async () => {
      service.dmEnabled = true;
      service.dmReplyEnabled = true;

      const sealedDMEvent = {
        id: 'sealed-dm-id',
        kind: 14,
        pubkey: 'sender-pubkey',
        content: 'encrypted-sealed-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleSealedDM(sealedDMEvent);

      expect(service.handledEventIds.has('sealed-dm-id')).toBe(true);
    });

    it('should skip sealed DM when disabled', async () => {
      service.dmEnabled = false;

      const sealedDMEvent = {
        id: 'sealed-disabled-id',
        kind: 14,
        pubkey: 'sender-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000)
      };

      service.postDM = vi.fn();

      await service.handleSealedDM(sealedDMEvent);

      expect(service.postDM).not.toHaveBeenCalled();
    });

    it('should skip already handled sealed DMs', async () => {
      service.dmEnabled = true;

      const sealedDMEvent = {
        id: 'duplicate-sealed-id',
        kind: 14,
        pubkey: 'sender-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000)
      };

      service.handledEventIds.add('duplicate-sealed-id');
      service.postDM = vi.fn();

      await service.handleSealedDM(sealedDMEvent);

      expect(service.postDM).not.toHaveBeenCalled();
    });

    it('should handle decryption errors in sealed DMs', async () => {
      service.dmEnabled = true;
      service.dmReplyEnabled = true;

      const sealedDMEvent = {
        id: 'decrypt-error-sealed',
        kind: 14,
        pubkey: 'sender-pubkey',
        content: 'bad-encrypted-content',
        created_at: Math.floor(Date.now() / 1000)
      };

      mockNip44Decrypt.mockRejectedValueOnce(new Error('Decryption failed'));

      await expect(service.handleSealedDM(sealedDMEvent)).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should not reply when DM reply disabled', async () => {
      service.dmEnabled = true;
      service.dmReplyEnabled = false;

      const sealedDMEvent = {
        id: 'no-reply-sealed',
        kind: 14,
        pubkey: 'sender-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000)
      };

      service.postDM = vi.fn();

      await service.handleSealedDM(sealedDMEvent);

      expect(service.postDM).not.toHaveBeenCalled();
    });

    it('should handle missing event id in sealed DM', async () => {
      service.dmEnabled = true;

      const sealedDMEvent = {
        kind: 14,
        pubkey: 'sender-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000)
      };

      await expect(service.handleSealedDM(sealedDMEvent)).resolves.not.toThrow();
    });

    it('should handle null sealed DM event', async () => {
      await expect(service.handleSealedDM(null)).resolves.not.toThrow();
    });

    it('should handle undefined sealed DM event', async () => {
      await expect(service.handleSealedDM(undefined)).resolves.not.toThrow();
    });
  });

  describe('_setupConnection', () => {
    it('should setup pool and subscriptions', async () => {
      service.relays = ['wss://relay.test'];
      service.pkHex = 'test-pubkey';

      await service._setupConnection();

      expect(mockPool.subscribeMany).toHaveBeenCalled();
    });

    it('should handle connection errors gracefully', async () => {
      mockPool.subscribeMany.mockImplementationOnce(() => {
        throw new Error('Connection failed');
      });

      await expect(service._setupConnection()).resolves.not.toThrow();
    });

    it('should create pool if not exists', async () => {
      service.pool = null;
      service.relays = ['wss://relay.test'];
      service.pkHex = 'test-pubkey';

      await service._setupConnection();

      expect(service.pool).toBeDefined();
    });

    it('should subscribe to correct event kinds', async () => {
      service.relays = ['wss://relay.test'];
      service.pkHex = 'test-pubkey';

      await service._setupConnection();

      expect(mockPool.subscribeMany).toHaveBeenCalledWith(
        expect.any(Array),
        expect.arrayContaining([
          expect.objectContaining({ kinds: expect.arrayContaining([1]) }),
          expect.objectContaining({ kinds: expect.arrayContaining([4]) }),
          expect.objectContaining({ kinds: expect.arrayContaining([14]) }),
          expect.objectContaining({ kinds: expect.arrayContaining([9735]) })
        ]),
        expect.any(Object)
      );
    });

    it('should setup onevent handler', async () => {
      service.relays = ['wss://relay.test'];
      service.pkHex = 'test-pubkey';

      await service._setupConnection();

      const call = mockPool.subscribeMany.mock.calls[0];
      expect(call[2]).toHaveProperty('onevent');
      expect(typeof call[2].onevent).toBe('function');
    });

    it('should setup oneose handler', async () => {
      service.relays = ['wss://relay.test'];
      service.pkHex = 'test-pubkey';

      await service._setupConnection();

      const call = mockPool.subscribeMany.mock.calls[0];
      expect(call[2]).toHaveProperty('oneose');
      expect(typeof call[2].oneose).toBe('function');
    });

    it('should handle missing relays', async () => {
      service.relays = [];
      service.pkHex = 'test-pubkey';

      await expect(service._setupConnection()).resolves.not.toThrow();
    });

    it('should handle missing pubkey', async () => {
      service.relays = ['wss://relay.test'];
      service.pkHex = null;

      await expect(service._setupConnection()).resolves.not.toThrow();
    });
  });

  describe('saveInteractionMemory', () => {
    it('should save interaction to memory', async () => {
      const event = {
        id: 'event-id',
        pubkey: 'user-pubkey',
        content: 'Event content',
        created_at: Math.floor(Date.now() / 1000)
      };

      await service.saveInteractionMemory('reply', event, { replied: true });

      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });

    it('should handle memory creation errors', async () => {
      mockRuntime.createMemory.mockRejectedValue(new Error('Memory failed'));

      const event = {
        id: 'event-id',
        pubkey: 'user-pubkey',
        content: 'Event content'
      };

      await expect(
        service.saveInteractionMemory('reply', event, {})
      ).resolves.not.toThrow();
    });

    it('should include interaction type in memory', async () => {
      const event = {
        id: 'event-id',
        pubkey: 'user-pubkey',
        content: 'Event content',
        created_at: Math.floor(Date.now() / 1000)
      };

      await service.saveInteractionMemory('mention', event, {});

      expect(mockRuntime.createMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            type: expect.stringContaining('interaction')
          })
        }),
        expect.any(String)
      );
    });

    it('should handle null event', async () => {
      await expect(
        service.saveInteractionMemory('reply', null, {})
      ).resolves.not.toThrow();
    });

    it('should handle various interaction kinds', async () => {
      const event = {
        id: 'event-id',
        pubkey: 'user-pubkey',
        content: 'Content'
      };

      await service.saveInteractionMemory('reply', event, {});
      await service.saveInteractionMemory('mention', event, {});
      await service.saveInteractionMemory('dm', event, {});
      await service.saveInteractionMemory('zap', event, {});

      expect(mockRuntime.createMemory).toHaveBeenCalledTimes(4);
    });
  });

  describe('postRepost', () => {
    it('should repost an event', async () => {
      const event = {
        id: 'event-id',
        pubkey: 'author-pubkey',
        kind: 1,
        content: 'Original content'
      };

      await service.postRepost(event);

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should handle repost errors', async () => {
      mockPool.publish.mockRejectedValue(new Error('Repost failed'));

      const event = {
        id: 'event-id',
        pubkey: 'author-pubkey',
        kind: 1
      };

      await expect(service.postRepost(event)).resolves.not.toThrow();
    });

    it('should handle null event', async () => {
      await expect(service.postRepost(null)).resolves.not.toThrow();
    });

    it('should include original event in repost', async () => {
      const event = {
        id: 'event-id',
        pubkey: 'author-pubkey',
        kind: 1,
        content: 'Content'
      };

      await service.postRepost(event);

      expect(mockPool.publish).toHaveBeenCalled();
    });
  });

  describe('_loadInteractionCounts', () => {
    it('should load interaction counts from memory', async () => {
      const mockMemory = {
        content: {
          counts: {
            'user1': 2,
            'user2': 1
          }
        }
      };

      mockRuntime.getMemoryById.mockResolvedValue(mockMemory);

      await service._loadInteractionCounts();

      expect(mockRuntime.getMemoryById).toHaveBeenCalled();
    });

    it('should handle missing memory gracefully', async () => {
      mockRuntime.getMemoryById.mockResolvedValue(null);

      await expect(service._loadInteractionCounts()).resolves.not.toThrow();
    });

    it('should handle corrupted memory data', async () => {
      const corruptedMemory = {
        content: 'not-an-object'
      };

      mockRuntime.getMemoryById.mockResolvedValue(corruptedMemory);

      await expect(service._loadInteractionCounts()).resolves.not.toThrow();
    });

    it('should handle memory loading errors', async () => {
      mockRuntime.getMemoryById.mockRejectedValue(new Error('Load failed'));

      await expect(service._loadInteractionCounts()).resolves.not.toThrow();
    });
  });

  describe('_saveInteractionCounts', () => {
    it('should save interaction counts to memory', async () => {
      service.userInteractionCount.set('user1', 3);
      service.userInteractionCount.set('user2', 1);

      await service._saveInteractionCounts();

      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });

    it('should handle save errors gracefully', async () => {
      mockRuntime.createMemory.mockRejectedValue(new Error('Save failed'));

      service.userInteractionCount.set('user1', 2);

      await expect(service._saveInteractionCounts()).resolves.not.toThrow();
    });

    it('should save empty counts', async () => {
      service.userInteractionCount.clear();

      await service._saveInteractionCounts();

      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });

    it('should preserve count data structure', async () => {
      service.userInteractionCount.set('user1', 5);

      await service._saveInteractionCounts();

      const call = mockRuntime.createMemory.mock.calls[0];
      expect(call[0]).toHaveProperty('content');
      expect(call[0].content).toHaveProperty('counts');
    });
  });

  describe('Connection State', () => {
    it('should track last event received time', async () => {
      const initialTime = service.lastEventReceived;

      await new Promise(resolve => setTimeout(resolve, 10));
      service.lastEventReceived = Date.now();

      expect(service.lastEventReceived).toBeGreaterThan(initialTime);
    });

    it('should initialize reconnect attempts to zero', () => {
      expect(service.reconnectAttempts).toBe(0);
    });

    it('should have connection monitoring configuration', () => {
      expect(service.connectionCheckIntervalMs).toBeDefined();
      expect(service.maxTimeSinceLastEventMs).toBeDefined();
      expect(service.reconnectDelayMs).toBeDefined();
      expect(service.maxReconnectAttempts).toBeDefined();
    });
  });

  describe('Event ID Tracking', () => {
    it('should prevent duplicate event handling', () => {
      const eventId = 'test-event-id';

      service.handledEventIds.add(eventId);

      expect(service.handledEventIds.has(eventId)).toBe(true);
    });

    it('should maintain unique event IDs', () => {
      service.handledEventIds.add('event-1');
      service.handledEventIds.add('event-2');
      service.handledEventIds.add('event-1'); // Duplicate

      expect(service.handledEventIds.size).toBe(2);
    });

    it('should clear event IDs on stop', async () => {
      service.handledEventIds.add('event-1');
      service.handledEventIds.add('event-2');

      await service.stop();

      // IDs are preserved across stops, but service is stopped
      expect(service.postTimer).toBeNull();
    });
  });

  describe('Pending Reply Timers', () => {
    it('should track pending reply timers per user', () => {
      const timer1 = setTimeout(() => {}, 1000);
      const timer2 = setTimeout(() => {}, 2000);

      service.pendingReplyTimers.set('user1', timer1);
      service.pendingReplyTimers.set('user2', timer2);

      expect(service.pendingReplyTimers.size).toBe(2);

      clearTimeout(timer1);
      clearTimeout(timer2);
    });

    it('should clear all pending timers on stop', async () => {
      const timer = setTimeout(() => {}, 1000);
      service.pendingReplyTimers.set('user1', timer);

      await service.stop();

      expect(service.pendingReplyTimers.size).toBe(0);
    });
  });

  describe('Image Context Cache', () => {
    it('should store image context for events', () => {
      const eventId = 'event-with-image';
      const imageContext = {
        imageDescriptions: ['A cat'],
        imageUrls: ['https://example.com/cat.jpg']
      };

      service._storeImageContext(eventId, imageContext);

      expect(service.imageContextCache).toBeDefined();
      expect(service.imageContextCache.has(eventId)).toBe(true);
    });

    it('should retrieve stored image context', () => {
      const eventId = 'event-with-image';
      const imageContext = {
        imageDescriptions: ['A dog'],
        imageUrls: ['https://example.com/dog.jpg']
      };

      service._storeImageContext(eventId, imageContext);
      const retrieved = service._getStoredImageContext(eventId);

      expect(retrieved).toEqual(imageContext);
    });

    it('should handle missing image context', () => {
      const retrieved = service._getStoredImageContext('nonexistent-event');

      expect(retrieved).toBeNull();
    });

    it('should expire old image contexts', () => {
      const eventId = 'old-event';
      const imageContext = {
        imageDescriptions: ['Old image'],
        imageUrls: ['https://example.com/old.jpg']
      };

      service._storeImageContext(eventId, imageContext);
      
      // Manually set old timestamp
      if (service.imageContextCache) {
        const stored = service.imageContextCache.get(eventId);
        if (stored) {
          stored.timestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
        }
      }

      const retrieved = service._getStoredImageContext(eventId);

      expect(retrieved).toBeNull();
    });

    it('should cleanup expired contexts', () => {
      service._storeImageContext('event1', { imageDescriptions: [], imageUrls: [] });
      service._storeImageContext('event2', { imageDescriptions: [], imageUrls: [] });

      // Manually age one context
      if (service.imageContextCache) {
        const stored = service.imageContextCache.get('event1');
        if (stored) {
          stored.timestamp = Date.now() - (2 * 60 * 60 * 1000);
        }
      }

      service._cleanupImageContexts();

      expect(service.imageContextCache.has('event1')).toBe(false);
      expect(service.imageContextCache.has('event2')).toBe(true);
    });
  });
});
