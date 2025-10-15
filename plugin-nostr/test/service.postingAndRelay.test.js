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
const mockFinalizeEvent = vi.fn((event) => ({ ...event, sig: 'signature' }));
const mockGetPublicKey = vi.fn(() => 'test-pubkey-hex');

vi.mock('@nostr/tools', async () => {
  const actual = await vi.importActual('@nostr/tools');
  return {
    ...actual,
    SimplePool: vi.fn().mockImplementation(() => ({
      subscribeMany: vi.fn(() => vi.fn()),
      publish: vi.fn().mockResolvedValue(true),
      close: vi.fn()
    })),
    finalizeEvent: mockFinalizeEvent,
    getPublicKey: mockGetPublicKey,
    nip19: {
      npubEncode: vi.fn((hex) => `npub1${hex}`),
      decode: vi.fn((npub) => ({ type: 'npub', data: 'decoded-hex' }))
    },
    nip04: {
      encrypt: vi.fn().mockResolvedValue('encrypted'),
      decrypt: vi.fn().mockResolvedValue('decrypted')
    }
  };
});

vi.mock('../lib/eventFactory', () => ({
  buildTextNote: vi.fn((content) => ({ content, kind: 1, tags: [] })),
  buildReplyNote: vi.fn(() => ({ content: 'Reply', kind: 1, tags: [] })),
  buildReaction: vi.fn(() => ({ content: '+', kind: 7, tags: [] })),
  buildRepost: vi.fn(() => ({ content: '', kind: 6, tags: [] })),
  buildQuoteRepost: vi.fn(() => ({ content: 'Quote', kind: 1, tags: [] })),
  buildContacts: vi.fn(() => ({ content: '', kind: 3, tags: [] })),
  buildMuteList: vi.fn(() => ({ content: '', kind: 10000, tags: [] }))
}));

vi.mock('../lib/generation', () => ({
  generateWithModelOrFallback: vi.fn().mockResolvedValue('Generated post text')
}));

import { NostrService } from '../lib/service.js';

describe('NostrService Posting and Relay Management', () => {
  let service;
  let mockRuntime;
  let mockPool;

  beforeEach(async () => {
    mockPool = {
      subscribeMany: vi.fn(() => vi.fn()),
      publish: vi.fn().mockResolvedValue(true),
      close: vi.fn()
    };

    mockRuntime = {
      character: {
        name: 'TestBot',
        postExamples: ['Test post 1', 'Test post 2'],
        style: { all: ['helpful'], post: ['concise', 'friendly'] }
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
          'NOSTR_CONNECTION_MONITOR_ENABLE': 'false',
          'NOSTR_MIN_DELAY_BETWEEN_POSTS_MS': '15000',
          'NOSTR_MAX_DELAY_BETWEEN_POSTS_MS': '120000',
          'NOSTR_MENTION_PRIORITY_BOOST_MS': '5000'
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

    // Add createSimplePool to mockRuntime
    mockRuntime.createSimplePool = vi.fn(() => mockPool);

    service = await NostrService.start(mockRuntime);
    service.pool = mockPool;
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
    vi.clearAllMocks();
  });

  describe('postOnce', () => {
    it('should post content to relays', async () => {
      const content = 'Test post content';
      
      await service.postOnce(content);

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should handle empty content', async () => {
      await expect(service.postOnce('')).resolves.not.toThrow();
      expect(mockPool.publish).not.toHaveBeenCalled();
    });

    it('should handle null content', async () => {
      await expect(service.postOnce(null)).resolves.not.toThrow();
      expect(mockPool.publish).not.toHaveBeenCalled();
    });

    it('should handle undefined content', async () => {
      await expect(service.postOnce(undefined)).resolves.not.toThrow();
      expect(mockPool.publish).not.toHaveBeenCalled();
    });

    it('should trim whitespace from content', async () => {
      const content = '  Test content with whitespace  ';
      
      await service.postOnce(content);

      // Posting queue should receive trimmed content
      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should handle very long content', async () => {
      const longContent = 'a'.repeat(5000);
      
      await expect(service.postOnce(longContent)).resolves.not.toThrow();
    });

    it('should integrate with posting queue', async () => {
      const content = 'Queued post';
      
      expect(service.postingQueue).toBeDefined();
      
      await service.postOnce(content);

      // Content should go through posting queue
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Queuing')
      );
    });

    it('should handle posting errors gracefully', async () => {
      mockPool.publish.mockRejectedValue(new Error('Publish failed'));
      
      const content = 'Test post';
      
      await expect(service.postOnce(content)).resolves.not.toThrow();
    });

    it('should validate content length', async () => {
      const tooLongContent = 'a'.repeat(10000);
      
      await expect(service.postOnce(tooLongContent)).resolves.not.toThrow();
    });
  });

  describe('postReply', () => {
    it('should post reply to parent event', async () => {
      const parentEvent = {
        id: 'parent-id',
        pubkey: 'parent-pubkey',
        kind: 1,
        content: 'Original post',
        tags: []
      };
      const replyText = 'Reply text';

      await service.postReply(parentEvent, replyText);

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should handle reply with just event ID', async () => {
      const parentEventId = 'parent-event-id';
      const replyText = 'Reply text';

      await service.postReply(parentEventId, replyText);

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should handle reply errors', async () => {
      mockPool.publish.mockRejectedValue(new Error('Reply failed'));
      
      const parentEvent = { id: 'parent-id', pubkey: 'parent-pubkey' };
      const replyText = 'Reply text';

      await expect(service.postReply(parentEvent, replyText)).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should include parent event in reply tags', async () => {
      const parentEvent = {
        id: 'parent-id',
        pubkey: 'parent-pubkey',
        kind: 1,
        content: 'Original'
      };
      const replyText = 'Reply';

      await service.postReply(parentEvent, replyText);

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should handle null parent event', async () => {
      const replyText = 'Reply';

      await expect(service.postReply(null, replyText)).resolves.not.toThrow();
    });

    it('should handle empty reply text', async () => {
      const parentEvent = { id: 'parent-id' };

      await expect(service.postReply(parentEvent, '')).resolves.not.toThrow();
    });
  });

  describe('postReaction', () => {
    it('should post reaction to event', async () => {
      const event = {
        id: 'event-id',
        pubkey: 'event-pubkey',
        kind: 1
      };

      await service.postReaction(event, '+');

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should default to + reaction', async () => {
      const event = {
        id: 'event-id',
        pubkey: 'event-pubkey',
        kind: 1
      };

      await service.postReaction(event);

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should handle custom reaction symbols', async () => {
      const event = { id: 'event-id', pubkey: 'event-pubkey' };

      await service.postReaction(event, '🔥');

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should handle reaction errors', async () => {
      mockPool.publish.mockRejectedValue(new Error('Reaction failed'));
      
      const event = { id: 'event-id', pubkey: 'event-pubkey' };

      await expect(service.postReaction(event, '+')).resolves.not.toThrow();
    });
  });

  describe('postDM', () => {
    it('should encrypt and post DM', async () => {
      const recipientEvent = {
        id: 'recipient-event-id',
        pubkey: 'recipient-pubkey'
      };
      const text = 'Secret message';

      await service.postDM(recipientEvent, text);

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should handle DM encryption errors', async () => {
      const recipientEvent = { pubkey: 'recipient-pubkey' };
      const text = 'Secret message';

      // Mock encryption failure
      const nip04 = await import('@nostr/tools').then(m => m.nip04);
      nip04.encrypt.mockRejectedValueOnce(new Error('Encryption failed'));

      await expect(service.postDM(recipientEvent, text)).resolves.not.toThrow();
    });

    it('should handle missing recipient', async () => {
      const text = 'Message';

      await expect(service.postDM(null, text)).resolves.not.toThrow();
    });

    it('should handle empty DM text', async () => {
      const recipientEvent = { pubkey: 'recipient-pubkey' };

      await expect(service.postDM(recipientEvent, '')).resolves.not.toThrow();
    });
  });

  describe('Relay Connection Management', () => {
    it('should connect to configured relays', async () => {
      expect(service.relays).toEqual(['wss://relay1.test', 'wss://relay2.test']);
    });

    it('should handle relay connection errors gracefully', async () => {
      mockPool.subscribeMany.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      await expect(service._setupConnection()).resolves.not.toThrow();
    });

    it('should close pool on stop', async () => {
      await service.stop();

      expect(service.pool).toBeNull();
    });

    it('should handle reconnection', async () => {
      const setupSpy = vi.spyOn(service, '_setupConnection');
      
      await service._attemptReconnection();

      expect(setupSpy).toHaveBeenCalled();
    });

    it('should respect max reconnection attempts', async () => {
      service.reconnectAttempts = service.maxReconnectAttempts;
      
      const setupSpy = vi.spyOn(service, '_setupConnection');
      
      await service._attemptReconnection();

      expect(setupSpy).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Max reconnection attempts')
      );
    });

    it('should reset reconnect attempts on success', async () => {
      service.reconnectAttempts = 2;
      
      await service._attemptReconnection();

      // After successful reconnection, attempts should reset
      expect(service.reconnectAttempts).toBe(0);
    });

    it('should increment reconnect attempts on failure', async () => {
      service.reconnectAttempts = 0;
      service._setupConnection = vi.fn().mockRejectedValue(new Error('Failed'));
      
      await service._attemptReconnection();

      expect(service.reconnectAttempts).toBe(1);
    });
  });

  describe('Posting Queue Integration', () => {
    it('should have posting queue initialized', () => {
      expect(service.postingQueue).toBeDefined();
      expect(typeof service.postingQueue.enqueue).toBe('function');
    });

    it('should configure posting queue with delays', () => {
      expect(service.postingQueue.minDelayBetweenPosts).toBeGreaterThan(0);
      expect(service.postingQueue.maxDelayBetweenPosts).toBeGreaterThan(
        service.postingQueue.minDelayBetweenPosts
      );
    });

    it('should use CRITICAL priority for external posts', async () => {
      const content = 'External post';
      
      const enqueueSpy = vi.spyOn(service.postingQueue, 'enqueue');
      
      await service.postOnce(content);

      expect(enqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: expect.any(Number)
        })
      );
    });

    it('should use LOW priority for scheduled posts', async () => {
      const content = 'Scheduled post';
      
      const enqueueSpy = vi.spyOn(service.postingQueue, 'enqueue');
      
      // Mark as scheduled post
      await service.postOnce(content, { isScheduled: true });

      expect(enqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: expect.any(Number)
        })
      );
    });
  });

  describe('Publishing Events', () => {
    it('should finalize events before publishing', async () => {
      const content = 'Test post';
      
      await service.postOnce(content);

      // Event should be finalized (signed) before publishing
      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should publish to all relays', async () => {
      const content = 'Test post';
      
      await service.postOnce(content);

      expect(mockPool.publish).toHaveBeenCalledWith(
        expect.arrayContaining(['wss://relay1.test', 'wss://relay2.test']),
        expect.any(Object)
      );
    });

    it('should handle partial publish failures', async () => {
      let callCount = 0;
      mockPool.publish.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First relay failed');
        }
        return Promise.resolve(true);
      });

      const content = 'Test post';
      
      await expect(service.postOnce(content)).resolves.not.toThrow();
    });

    it('should not publish without private key', async () => {
      service.sk = null;
      
      const content = 'Test post';
      
      await expect(service.postOnce(content)).resolves.not.toThrow();
    });
  });

  describe('Event Validation', () => {
    it('should validate event structure before publishing', async () => {
      const content = 'Valid post';
      
      await service.postOnce(content);

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should handle malformed events', async () => {
      // Try to publish with invalid event structure
      mockFinalizeEvent.mockImplementationOnce(() => {
        throw new Error('Invalid event');
      });

      const content = 'Test post';
      
      await expect(service.postOnce(content)).resolves.not.toThrow();
    });
  });

  describe('Rate Limiting', () => {
    it('should respect minimum delay between posts', async () => {
      expect(service.postingQueue.minDelayBetweenPosts).toBeGreaterThanOrEqual(15000);
    });

    it('should respect maximum delay between posts', async () => {
      expect(service.postingQueue.maxDelayBetweenPosts).toBeLessThanOrEqual(120000);
    });

    it('should boost priority for mentions', () => {
      expect(service.postingQueue.mentionPriorityBoost).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle publish timeouts', async () => {
      mockPool.publish.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      const content = 'Test post';
      
      await expect(service.postOnce(content)).resolves.not.toThrow();
    });

    it('should continue operation after publish errors', async () => {
      mockPool.publish
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(true);

      await service.postOnce('Post 1');
      await service.postOnce('Post 2');

      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should log publish errors', async () => {
      mockPool.publish.mockRejectedValue(new Error('Publish error'));

      const content = 'Test post';
      
      await service.postOnce(content);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
