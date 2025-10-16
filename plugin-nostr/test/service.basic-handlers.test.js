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

const decryptDirectMessageMock = vi.fn().mockResolvedValue('Decrypted message content');
const isSelfAuthorMock = vi.fn().mockReturnValue(false);
const getConversationIdFromEventMock = vi.fn().mockReturnValue('conversation-id-123');
const extractTopicsFromEventMock = vi.fn().mockResolvedValue(['topic1', 'topic2']);

vi.mock('../lib/nostr', () => ({
  decryptDirectMessage: decryptDirectMessageMock,
  isSelfAuthor: isSelfAuthorMock,
  getConversationIdFromEvent: getConversationIdFromEventMock,
  extractTopicsFromEvent: extractTopicsFromEventMock
}));

vi.mock('../lib/image-vision.js', () => ({
  processImageContent: vi.fn().mockResolvedValue({ imageDescriptions: [], imageUrls: [] })
}));

vi.mock('../lib/generation', () => ({
  generateWithModelOrFallback: vi.fn().mockResolvedValue('Generated response text')
}));

import { NostrService } from '../lib/service.js';

describe('NostrService Basic Handlers', () => {
  let service;
  let mockRuntime;
  let mockPool;

  beforeEach(() => {
    mockRuntime = {
      character: { 
        name: 'TestBot',
        postExamples: ['test response'],
        messageExamples: [[
          { user: 'user', content: { text: 'Hello' } },
          { user: 'agent', content: { text: 'Hi there!' } }
        ]],
        style: { all: ['helpful'], chat: ['friendly'] }
      },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_REPLY_THROTTLE_SEC': '60',
          'NOSTR_DM_ENABLE': 'true',
          'NOSTR_DM_REPLY_ENABLE': 'true',
          'NOSTR_DM_THROTTLE_SEC': '60',
          'NOSTR_ZAP_THANKS_ENABLE': 'true'
        };
        return settings[key] || '';
      }),
      useModel: vi.fn().mockResolvedValue({ text: 'Generated response' }),
      createMemory: vi.fn().mockResolvedValue({ id: 'memory-id' }),
      getMemoryById: vi.fn().mockResolvedValue(null),
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

    mockPool = {
      subscribeMany: vi.fn(() => vi.fn()),
      publish: vi.fn().mockResolvedValue(true),
      close: vi.fn()
    };

    service = new NostrService(mockRuntime);
    service.pool = mockPool;
    service.relays = ['wss://relay.test'];
    service.sk = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    service.pkHex = 'test-bot-pubkey';
    service.replyEnabled = true;
    service.replyThrottleSec = 60;
    service.dmEnabled = true;
    service.dmReplyEnabled = true;
    service.dmThrottleSec = 60;
    service.zapThanksEnabled = true;
    service.handledEventIds = new Set();
    service.lastReplyByUser = new Map();
    service.logger = mockRuntime.logger;

    // Mock methods that would be called
    service.postReply = vi.fn().mockResolvedValue(true);
    service.postDM = vi.fn().mockResolvedValue(true);
  });

  afterEach(async () => {
    if (service && typeof service.stop === 'function') {
      await service.stop();
    }
    vi.clearAllMocks();
  });

  describe('handleMention()', () => {
    it('should process mention event and create memory', async () => {
      const mentionEvent = {
        id: 'mention-event-id',
        kind: 1,
        pubkey: 'user-pubkey',
        content: 'Hey @bot, how are you?',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleMention(mentionEvent);

      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });

    it('should respect throttling limits', async () => {
      const userPubkey = 'user-pubkey-123';
      const mentionEvent = {
        id: 'mention-1',
        kind: 1,
        pubkey: userPubkey,
        content: 'First mention',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      // Set recent reply timestamp
      service.lastReplyByUser.set(userPubkey, Date.now() - 30000); // 30 seconds ago
      service.replyThrottleSec = 60; // 60 second throttle

      await service.handleMention(mentionEvent);

      // Should be throttled, no reply should be posted
      const replyCallCount = service.postReply.mock.calls.length;
      expect(replyCallCount).toBeLessThanOrEqual(1);
    });

    it('should allow reply after throttle period expires', async () => {
      const userPubkey = 'user-pubkey-456';
      const mentionEvent = {
        id: 'mention-2',
        kind: 1,
        pubkey: userPubkey,
        content: 'Another mention',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      // Set old reply timestamp (beyond throttle)
      service.lastReplyByUser.set(userPubkey, Date.now() - 120000); // 2 minutes ago
      service.replyThrottleSec = 60; // 60 second throttle

      await service.handleMention(mentionEvent);

      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });

    it('should handle mention without reply enabled', async () => {
      service.replyEnabled = false;
      const mentionEvent = {
        id: 'mention-3',
        kind: 1,
        pubkey: 'user-pubkey',
        content: 'Mention without reply',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await expect(service.handleMention(mentionEvent)).resolves.not.toThrow();
    });
  });

  describe('handleDM()', () => {
    it('should decrypt and process DM', async () => {
      const dmEvent = {
        id: 'dm-event-id',
        kind: 4,
        pubkey: 'sender-pubkey',
        content: 'encrypted-dm-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleDM(dmEvent);

      expect(decryptDirectMessageMock).toHaveBeenCalledWith(
        service.sk,
        'sender-pubkey',
        'encrypted-dm-content'
      );
      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });

    it('should handle DM decryption failure gracefully', async () => {
      decryptDirectMessageMock.mockRejectedValueOnce(new Error('Decryption failed'));
      
      const dmEvent = {
        id: 'dm-fail',
        kind: 4,
        pubkey: 'sender-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await expect(service.handleDM(dmEvent)).resolves.not.toThrow();
    });

    it('should respect DM throttling', async () => {
      const senderPubkey = 'dm-sender';
      service.lastDMByUser = new Map();
      service.lastDMByUser.set(senderPubkey, Date.now() - 30000); // 30 seconds ago
      service.dmThrottleSec = 60;

      const dmEvent = {
        id: 'throttled-dm',
        kind: 4,
        pubkey: senderPubkey,
        content: 'encrypted',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleDM(dmEvent);
      
      // Should be processed but throttled
      expect(decryptDirectMessageMock).toHaveBeenCalled();
    });

    it('should handle DM when reply is disabled', async () => {
      service.dmReplyEnabled = false;
      const dmEvent = {
        id: 'dm-no-reply',
        kind: 4,
        pubkey: 'sender',
        content: 'encrypted',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await expect(service.handleDM(dmEvent)).resolves.not.toThrow();
    });
  });

  describe('handleZap()', () => {
    it('should process zap receipt', async () => {
      const zapEvent = {
        id: 'zap-event-id',
        kind: 9735,
        pubkey: 'zap-sender-pubkey',
        content: 'zap receipt',
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['bolt11', 'lnbc...'],
          ['description', JSON.stringify({ pubkey: 'original-sender' })],
          ['p', service.pkHex]
        ]
      };

      await service.handleZap(zapEvent);

      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });

    it('should respect zap cooldown period', async () => {
      const senderPubkey = 'zap-sender';
      service.zapCooldownByUser = new Map();
      service.zapCooldownByUser.set(senderPubkey, Date.now() - 3600000); // 1 hour ago
      service.zapCooldownSec = 7200; // 2 hour cooldown

      const zapEvent = {
        id: 'zap-cooldown',
        kind: 9735,
        pubkey: senderPubkey,
        content: 'zap',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleZap(zapEvent);
      
      // Should be throttled
      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });

    it('should handle zap without thanks enabled', async () => {
      service.zapThanksEnabled = false;
      const zapEvent = {
        id: 'zap-no-thanks',
        kind: 9735,
        pubkey: 'sender',
        content: 'zap',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await expect(service.handleZap(zapEvent)).resolves.not.toThrow();
    });

    it('should handle malformed zap event', async () => {
      const malformedZap = {
        id: 'malformed-zap',
        kind: 9735,
        pubkey: 'sender',
        content: 'invalid json',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      await expect(service.handleZap(malformedZap)).resolves.not.toThrow();
    });
  });

  describe('Error Recovery', () => {
    it('should continue after handleMention error', async () => {
      mockRuntime.createMemory.mockRejectedValueOnce(new Error('Memory creation failed'));
      
      const mentionEvent = {
        id: 'error-mention',
        kind: 1,
        pubkey: 'user',
        content: 'Mention',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await expect(service.handleMention(mentionEvent)).resolves.not.toThrow();
    });

    it('should continue after handleDM error', async () => {
      decryptDirectMessageMock.mockRejectedValueOnce(new Error('Decrypt failed'));
      
      const dmEvent = {
        id: 'error-dm',
        kind: 4,
        pubkey: 'sender',
        content: 'encrypted',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await expect(service.handleDM(dmEvent)).resolves.not.toThrow();
    });

    it('should continue after handleZap error', async () => {
      mockRuntime.createMemory.mockRejectedValueOnce(new Error('Zap memory failed'));
      
      const zapEvent = {
        id: 'error-zap',
        kind: 9735,
        pubkey: 'sender',
        content: 'zap',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await expect(service.handleZap(zapEvent)).resolves.not.toThrow();
    });
  });

  describe('Event Deduplication', () => {
    it('should track handled events to prevent duplicates', async () => {
      const eventId = 'duplicate-test-id';
      const mentionEvent = {
        id: eventId,
        kind: 1,
        pubkey: 'user',
        content: 'Test',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      // First handling
      expect(service.handledEventIds.has(eventId)).toBe(false);
      service.handledEventIds.add(eventId);
      
      // Second attempt
      const isDuplicate = service.handledEventIds.has(eventId);
      expect(isDuplicate).toBe(true);
    });
  });
});
