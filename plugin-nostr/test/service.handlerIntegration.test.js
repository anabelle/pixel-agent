
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the core module before importing the service
// Use default export to work with both ESM and CommonJS
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
  // Expose for CommonJS require()
  mocked.default = mocked;
  return mocked;
});

const {
  decryptDirectMessageMock,
  isSelfAuthorMock,
  getConversationIdFromEventMock,
  extractTopicsFromEventMock,
  buildZapThanksPostMock,
} = vi.hoisted(() => ({
  decryptDirectMessageMock: vi.fn().mockResolvedValue('Decrypted DM content'),
  isSelfAuthorMock: vi.fn().mockReturnValue(false),
  getConversationIdFromEventMock: vi.fn().mockReturnValue('conversation-id'),
   extractTopicsFromEventMock: vi.fn().mockResolvedValue([]),
  buildZapThanksPostMock: vi.fn(() => ({
    parent: { id: 'parent-event-id', pubkey: 'sender-pubkey' },
    text: 'Thanks for the zap!',
    options: {},
  })),
}));

function nostrMockFactory() {
  return {
    decryptDirectMessage: decryptDirectMessageMock,
    isSelfAuthor: isSelfAuthorMock,
    getConversationIdFromEvent: getConversationIdFromEventMock,
    extractTopicsFromEvent: extractTopicsFromEventMock,
  };
}

vi.mock('../lib/nostr', nostrMockFactory);
vi.mock('../lib/nostr.js', nostrMockFactory);

vi.mock('../lib/image-vision.js', () => ({
  processImageContent: vi.fn().mockResolvedValue({ imageDescriptions: [], imageUrls: [] })
}));

vi.mock('../lib/zapHandler.js', () => ({
  buildZapThanksPost: buildZapThanksPostMock
}));

import { NostrService } from '../lib/service.js';

describe('NostrService Handler Integration', () => {
  let service;
  let mockRuntime;

  beforeEach(async () => {
    // Mock global logger
    global.logger = {
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    };

    // Also inject logger into the service module
    const serviceModule = await import('../lib/service.js');
    if (serviceModule) {
      // Inject logger into module scope if possible
      try {
        // This is a workaround since we can't easily access module-level variables
        // The service will try to use logger from @elizaos/core which we mocked above
      } catch (e) {
        // Ignore
      }
    }

    mockRuntime = {
      character: { 
        name: 'TestBot',
        postExamples: ['test response'],
        style: { post: ['helpful'] }
      },
      logger: {
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
      },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://test.relay',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_LISTEN_ENABLE': 'true',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_DM_ENABLE': 'true',
          'NOSTR_DM_REPLY_ENABLE': 'true',
          'NOSTR_REPLY_THROTTLE_SEC': '5' // Short for testing
        };
        return settings[key] || '';
      }),
      useModel: vi.fn().mockResolvedValue({ text: 'Generated response' }),
      createMemory: vi.fn().mockResolvedValue(true),
      getMemoryById: vi.fn().mockResolvedValue(null),
      getMemories: vi.fn().mockResolvedValue([]),
      ensureWorldExists: vi.fn().mockResolvedValue(true),
      ensureRoomExists: vi.fn().mockResolvedValue(true),
      ensureConnection: vi.fn().mockResolvedValue(true),
      agentId: 'test-agent',
      logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn() }
    };

    service = new NostrService(mockRuntime);
    service.pool = {
      subscribeMany: vi.fn(),
      publish: vi.fn().mockResolvedValue(true),
      close: vi.fn()
    };
    service.pkHex = 'bot-pubkey-hex';
    service.sk = 'bot-private-key';
    service.relays = ['wss://test.relay'];
    
    // Initialize properties that are normally set in start()
    service.maxEventAgeDays = 2;
    service.handledEventIds = new Set();
    service.lastReplyByUser = new Map();
    service.pendingReplyTimers = new Map();
    service.replyEnabled = true;
    service.replyThrottleSec = 5;
    service.dmEnabled = true;
    service.dmReplyEnabled = true;
    service.dmThrottleSec = 30;
    service.logger = mockRuntime.logger;
    
    // Mock common service methods
    service.isSelfAuthor = vi.fn().mockReturnValue(false);
    service.shouldReplyToMention = vi.fn().mockReturnValue(true);
    service.postReply = vi.fn().mockResolvedValue(true);
    service.saveInteractionMemory = vi.fn().mockResolvedValue(true);
    service._createMemorySafe = vi.fn().mockResolvedValue(true);
    service.generateReplyTextLLM = vi.fn().mockResolvedValue('Reply text');
    service.generateZapThanksTextLLM = vi.fn(async () => {
      await mockRuntime.useModel('zap-thanks', { prompt: 'zap' });
      return 'Thanks for the zap!';
    });
    service._isActualMention = vi.fn().mockReturnValue(true);
    service._isRelevantMention = vi.fn().mockResolvedValue(true);
    service._isUserMuted = vi.fn().mockResolvedValue(false);
    service._ensureNostrContext = vi.fn().mockResolvedValue({ roomId: 'room-1', entityId: 'entity-1' });
    service._getThreadContext = vi.fn().mockResolvedValue({ thread: [], isRoot: true });
    service.postDM = vi.fn().mockResolvedValue(true);
    service.postingQueue.enqueue = vi.fn().mockResolvedValue(true);
    service.replyInitialDelayMinMs = 0;
    service.replyInitialDelayMaxMs = 0;
    service.dmThrottleSec = 30;
    service._decryptDirectMessage = decryptDirectMessageMock;
  });

  afterEach(() => {
    decryptDirectMessageMock.mockClear();
    decryptDirectMessageMock.mockResolvedValue('Decrypted DM content');
    isSelfAuthorMock.mockReturnValue(false);
    buildZapThanksPostMock.mockClear();
    if (service?.pendingReplyTimers) {
      for (const timer of service.pendingReplyTimers.values()) {
        clearTimeout(timer);
      }
      service.pendingReplyTimers.clear();
    }
    vi.clearAllTimers();
  });

  describe('handleMention', () => {
    it('processes mention correctly', async () => {
      const mentionEvent = {
        id: 'mention-123',
        kind: 1,
        pubkey: 'user-pubkey',
        content: '@bot hello there!',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleMention(mentionEvent);

      expect(service._createMemorySafe).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            text: '@bot hello there!',
            source: 'nostr'
          })
        }),
        'messages'
      );
    });

    it('skips self-authored mentions', async () => {
      const selfMention = {
        id: 'self-mention-123',
        kind: 1,
        pubkey: service.pkHex, // Same as bot
        content: 'My own post',
        created_at: Math.floor(Date.now() / 1000)
      };

      await service.handleMention(selfMention);

      expect(service._createMemorySafe).not.toHaveBeenCalled();
    });

    it('respects throttling between replies', async () => {
      const userPubkey = 'frequent-user';
      
      // First mention
      const mention1 = {
        id: 'mention-1',
        kind: 1,
        pubkey: userPubkey,
        content: 'First message',
        created_at: Math.floor(Date.now() / 1000)
      };

      // Second mention from same user (should be throttled)
      const mention2 = {
        id: 'mention-2', 
        kind: 1,
        pubkey: userPubkey,
        content: 'Second message',
        created_at: Math.floor(Date.now() / 1000)
      };

      await service.handleMention(mention1);
      await service.handleMention(mention2);

      // Should create memory for both but only reply to first
      expect(service._createMemorySafe).toHaveBeenCalledTimes(2);
      
      // Check that second reply was scheduled (pendingReplyTimers)
      expect(service.pendingReplyTimers.has(userPubkey)).toBe(true);
    });
  });

  describe('handleDM', () => {
    beforeEach(() => {
      service.shouldReplyToDM = vi.fn().mockReturnValue(true);
      service.postReply = vi.fn().mockResolvedValue(true);
      service.saveInteractionMemory = vi.fn().mockResolvedValue(true);
    });

    it('processes DM correctly when decryption succeeds', async () => {
      decryptDirectMessageMock.mockResolvedValue('Decrypted DM content');
      const dmEvent = {
        id: 'dm-123',
        kind: 4,
        pubkey: 'user-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleDM(dmEvent);

      expect(service._createMemorySafe).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            source: 'nostr'
          })
        }),
        'messages'
      );
    });

    it('skips DM when decryption fails', async () => {
      // Mock decryption failure
      decryptDirectMessageMock.mockResolvedValueOnce(null);

      const dmEvent = {
        id: 'dm-fail-123',
        kind: 4,
        pubkey: 'user-pubkey',
        content: 'bad-encrypted-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleDM(dmEvent);

      expect(service._createMemorySafe).not.toHaveBeenCalled();
    });

    it('respects DM-specific throttling', async () => {
      const userPubkey = 'dm-user';
      decryptDirectMessageMock.mockResolvedValue('Decrypted DM content');

      const dm1 = {
        id: 'dm-1',
        kind: 4,
        pubkey: userPubkey,
        content: 'encrypted-1',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      const dm2 = {
        id: 'dm-2',
        kind: 4,
        pubkey: userPubkey,
        content: 'encrypted-2',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleDM(dm1);
      await service.handleDM(dm2);

      // Should schedule second DM reply
      expect(service.pendingReplyTimers.has(userPubkey)).toBe(true);
    });
  });

  describe('Service stop and cleanup', () => {
    it('clears all timers on stop', async () => {
      service.postTimer = setTimeout(() => {}, 10000);
      service.hourlyDigestTimer = setTimeout(() => {}, 10000);
      service.dailyReportTimer = setTimeout(() => {}, 10000);
      service.selfReflectionTimer = setTimeout(() => {}, 10000);
      
      await service.stop();
      
      expect(service.postTimer).toBe(null);
      expect(service.hourlyDigestTimer).toBe(null);
      expect(service.dailyReportTimer).toBe(null);
      expect(service.selfReflectionTimer).toBe(null);
    });

    it('closes relay pool on stop', async () => {
      const mockPool = {
        close: vi.fn().mockResolvedValue(undefined)
      };
      service.pool = mockPool;
      
      await service.stop();
      
      expect(mockPool.close).toHaveBeenCalled();
    });

    it('unsubscribes from listeners on stop', async () => {
      const mockUnsub = vi.fn();
      service.listenUnsub = mockUnsub;
      
      await service.stop();
      
      expect(mockUnsub).toHaveBeenCalled();
      expect(service.listenUnsub).toBe(null);
    });

    it('clears pending reply timers on stop', async () => {
      service.pendingReplyTimers.set('user1', setTimeout(() => {}, 10000));
      service.pendingReplyTimers.set('user2', setTimeout(() => {}, 10000));
      
      await service.stop();
      
      expect(service.pendingReplyTimers.size).toBe(0);
    });
  });

  describe('Posting methods', () => {
    beforeEach(() => {
      const mockPool = {
        publish: vi.fn().mockResolvedValue({ relay: 'wss://relay.test', ok: true })
      };
      service.pool = mockPool;
      service.postingQueue = {
        enqueue: vi.fn().mockResolvedValue({ published: true }),
        priorities: { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 }
      };
    });

    it('postOnce uses posting queue with CRITICAL priority for external posts', async () => {
      await service.postOnce('Test post content');
      
      expect(service.postingQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Test post content',
          priority: 0 // CRITICAL
        })
      );
    });

    it('postReply tags parent event correctly', async () => {
      const parentEvent = {
        id: 'parent-123',
        pubkey: 'parent-author'
      };
      
      await service.postReply('Reply text', parentEvent);
      
      expect(service.postingQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Reply text',
          tags: expect.arrayContaining([
            ['e', 'parent-123', '', 'reply'],
            ['p', 'parent-author']
          ])
        })
      );
    });

    it('postReaction creates reaction event with emoji', async () => {
      const targetEvent = {
        id: 'target-123',
        pubkey: 'target-author'
      };
      
      await service.postReaction(targetEvent, '🔥');
      
      expect(service.postingQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 7,
          content: '🔥',
          tags: expect.arrayContaining([
            ['e', 'target-123'],
            ['p', 'target-author']
          ])
        })
      );
    });

    it('postRepost creates kind 6 repost event', async () => {
      const originalEvent = {
        id: 'original-123',
        pubkey: 'original-author'
      };
      
      await service.postRepost(originalEvent);
      
      expect(service.postingQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 6,
          tags: expect.arrayContaining([
            ['e', 'original-123'],
            ['p', 'original-author']
          ])
        })
      );
    });
  });

  describe('Mute list functionality', () => {
    it('muteUser adds pubkey to muted set', () => {
      service.muteUser('bad-actor-pubkey');
      
      expect(service.mutedUsers.has('bad-actor-pubkey')).toBe(true);
    });

    it('unmuteUser removes pubkey from muted set', () => {
      service.mutedUsers.add('user-pubkey');
      service.unmuteUser('user-pubkey');
      
      expect(service.mutedUsers.has('user-pubkey')).toBe(false);
    });

    it('skips handling events from muted users', async () => {
      service.mutedUsers.add('muted-user');
      
      const mutedMention = {
        id: 'muted-123',
        kind: 1,
        pubkey: 'muted-user',
        content: '@bot hello',
        created_at: Math.floor(Date.now() / 1000)
      };
      
      await service.handleMention(mutedMention);
      
      expect(service._createMemorySafe).not.toHaveBeenCalled();
    });
  });

  describe('Event deduplication', () => {
    it('skips already handled events', async () => {
      const mention = {
        id: 'duplicate-123',
        kind: 1,
        pubkey: 'user-pubkey',
        content: '@bot hello',
        created_at: Math.floor(Date.now() / 1000)
      };
      
      // Process once
      await service.handleMention(mention);
      expect(service._createMemorySafe).toHaveBeenCalledTimes(1);
      
      // Try again - should skip
      await service.handleMention(mention);
      expect(service._createMemorySafe).toHaveBeenCalledTimes(1); // Still 1
    });

    it('tracks handled event IDs in Set', async () => {
      const mention = {
        id: 'unique-123',
        kind: 1,
        pubkey: 'user-pubkey',
        content: '@bot hello',
        created_at: Math.floor(Date.now() / 1000)
      };
      
      await service.handleMention(mention);
      
      expect(service.handledEventIds.has('unique-123')).toBe(true);
    });
  });

  describe('Error handling and recovery', () => {
    it('continues processing after pool publish error', async () => {
      const mockPool = {
        publish: vi.fn().mockRejectedValue(new Error('Relay connection failed'))
      };
      service.pool = mockPool;
      
      // Should not throw
      await expect(service.postOnce('Test post')).resolves.toBeDefined();
    });

    it('continues after memory creation error', async () => {
      service._createMemorySafe.mockRejectedValueOnce(new Error('DB error'));
      
      const mention = {
        id: 'error-mention',
        kind: 1,
        pubkey: 'user-pubkey',
        content: '@bot hello',
        created_at: Math.floor(Date.now() / 1000)
      };
      
      // Should not throw
      await expect(service.handleMention(mention)).resolves.not.toThrow();
    });

    it('handles missing pool gracefully', async () => {
      service.pool = null;
      
      // Should not throw
      await expect(service.postOnce('Test')).resolves.toBeDefined();
    });
  });

  describe('Throttling state management', () => {
    it('clears expired throttle entries', async () => {
      const userPubkey = 'throttled-user';
      
      // Set old timestamp (expired)
      service.lastReplyByUser.set(userPubkey, Date.now() - 120000); // 2 minutes ago
      
      const mention = {
        id: 'new-mention',
        kind: 1,
        pubkey: userPubkey,
        content: '@bot hello again',
        created_at: Math.floor(Date.now() / 1000)
      };
      
      await service.handleMention(mention);
      
      // Should allow reply since throttle expired
      expect(service._createMemorySafe).toHaveBeenCalled();
    });

    it('maintains zapCooldownByUser map', async () => {
      const zapEvent = {
        id: 'zap-123',
        kind: 9735,
        pubkey: 'zapper-pubkey',
        content: 'zap-receipt-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', service.pkHex],
          ['bolt11', 'lnbc...'],
          ['description', '{"amount":1000}']
        ]
      };
      
      await service.handleZap(zapEvent);
      
      expect(service.zapCooldownByUser.has('zapper-pubkey')).toBe(true);
    });
  });

  describe('handleZap', () => {
    it('processes zap correctly', async () => {
      const zapEvent = {
        id: 'zap-123',
        kind: 9735,
        pubkey: 'zapper-pubkey',
        content: 'zap-receipt-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', service.pkHex],
          ['bolt11', 'lnbc...invoice...'],
          ['description', '{"amount":1000}']
        ]
      };

      await service.handleZap(zapEvent);

      // Should generate thanks response
      expect(mockRuntime.useModel).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          prompt: expect.stringContaining('zap')
        })
      );
    });

    it('respects zap cooldown per user', async () => {
      const zapperPubkey = 'frequent-zapper';
      
      const zap1 = {
        id: 'zap-1',
        kind: 9735,
        pubkey: zapperPubkey,
        content: 'zap-1',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      const zap2 = {
        id: 'zap-2',
        kind: 9735,
        pubkey: zapperPubkey,
        content: 'zap-2',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleZap(zap1);
      await service.handleZap(zap2);

      // Second zap should be ignored due to cooldown
      expect(mockRuntime.useModel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cross-Handler Interactions', () => {
    it('handles mixed event types from same user correctly', async () => {
      const userPubkey = 'multi-user';
      
      const mention = {
        id: 'mention-1',
        kind: 1,
        pubkey: userPubkey,
        content: 'Hello bot!',
        created_at: Math.floor(Date.now() / 1000)
      };

      const zap = {
        id: 'zap-1',
        kind: 9735,
        pubkey: userPubkey,
        content: 'zap receipt',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleMention(mention);
      await service.handleZap(zap);

      // Zap should cancel any pending mention reply
      expect(service.pendingReplyTimers.has(userPubkey)).toBe(false);
    });

    it('maintains separate throttling for mentions vs DMs', async () => {
      const userPubkey = 'mixed-user';
      
      const mention = {
        id: 'mention-1',
        kind: 1,
        pubkey: userPubkey,
        content: 'Public mention',
        created_at: Math.floor(Date.now() / 1000)
      };

      const dm = {
        id: 'dm-1',
        kind: 4,
        pubkey: userPubkey,
        content: 'encrypted-dm',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleMention(mention);
      await service.handleDM(dm);

      // Both should be processed (different throttling pools)
      expect(service._createMemorySafe).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('continues processing after handler errors', async () => {
      // Mock memory creation failure
      service._createMemorySafe.mockRejectedValueOnce(new Error('Database error'));

      const mention = {
        id: 'mention-error',
        kind: 1,
        pubkey: 'user-pubkey',
        content: 'This will fail',
        created_at: Math.floor(Date.now() / 1000)
      };

      // Should not throw
      await expect(service.handleMention(mention)).resolves.toBeUndefined();
    });

    it('handles missing event properties gracefully', async () => {
      const malformedEvent = {
        // Missing id, kind, etc.
        pubkey: 'user-pubkey',
        content: 'Malformed event'
      };

      await expect(service.handleMention(malformedEvent)).resolves.toBeUndefined();
      await expect(service.handleDM(malformedEvent)).resolves.toBeUndefined();
      await expect(service.handleZap(malformedEvent)).resolves.toBeUndefined();
    });
  });
});
